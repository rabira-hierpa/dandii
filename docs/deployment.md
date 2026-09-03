# Deployment

Two environments, both on Coolify, both deployed automatically by CI.

| Branch | Domain | Coolify resource |
|---|---|---|
| `dev` | dev.dandii.app | development |
| `main` | addis.dandii.app | production |

## How the automation works

Deploys are jobs in `.github/workflows/ci.yml`, not a Coolify branch watcher.
They hang off `needs: [check, feed-validator]`, so a deploy cannot start unless
typecheck, lint, unit tests and the GTFS validator gate all passed on that exact
commit. A Coolify branch watcher would deploy a red build just as happily; this
will not.

```
push to dev  ──▶ check ─┐
                        ├─▶ deploy-dev        ──▶ dev.dandii.app
             feed-validator ─┘

push to main ──▶ check ─┐
                        ├─▶ deploy-production ──▶ addis.dandii.app
             feed-validator ─┘
```

### GitHub secrets to add

Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `COOLIFY_URL` | Your Coolify origin, no trailing slash, e.g. `https://coolify.example.com` |
| `COOLIFY_TOKEN` | Coolify → Keys & Tokens → API tokens. Needs deploy permission. |
| `COOLIFY_DEV_UUID` | UUID of the dev resource (in its Coolify URL) |
| `COOLIFY_PROD_UUID` | UUID of the production resource |

Until these exist the deploy jobs skip with a notice instead of failing, so
you can merge this workflow before configuring Coolify without turning CI red.
Once set, they deploy.

Confirm the deploy endpoint against your Coolify version. The workflow uses
`GET /api/v1/deploy?uuid=…&force=false` with a bearer token. Some versions
expose a per-resource webhook URL instead, which needs no token — if that is
what your instance shows, swap the `curl` for that URL.

### Making production a one-click approval

`deploy-production` declares `environment: production`. Add a required reviewer
to that environment in GitHub settings and pushes to `main` will wait for your
approval instead of going straight out. Nothing in the workflow changes.

## DNS and domains

DNS lives at Hostinger; the app runs on the VPS behind Coolify's Traefik.
Only an A record is needed:

| Host | Type | Value |
|---|---|---|
| `dev` | A | the VPS IP |
| `addis` | A | the same VPS IP |

**Ignore Hostinger's "Subdomains" tab.** It manages sites hosted on Hostinger's
own shared hosting and will stay empty forever for a VPS-hosted app. An A
record in "DNS records" is the whole job.

The apex `dandii.app` still points at Hostinger, which is fine — the bare
domain does not serve the app.

### Telling Coolify about the domain

DNS resolving is not enough. Traefik routes by hostname, so until the domain is
set on the Coolify resource you get a 404 over HTTP and `TRAEFIK DEFAULT CERT`
over HTTPS, from a server that is otherwise healthy.

On the resource → Configuration → Domains, set `https://addis.dandii.app`
**including the scheme** (Coolify reads it to decide whether to request a
certificate), then **redeploy** — Traefik labels are rewritten on deploy, not
on save. Let's Encrypt issues shortly after.

Verify:

```bash
echo | openssl s_client -connect addis.dandii.app:443 -servername addis.dandii.app 2>/dev/null \
  | openssl x509 -noout -subject -issuer
```

A real issuer means it worked; `TRAEFIK DEFAULT CERT` means Traefik still has
no route for that hostname. Note that the 404 looks identical whether the
resource exists without a domain or does not exist yet.

## Production environment variables

Set these on the Coolify production resource. Everything except
`DATABASE_URL` and `OTP_URL` must differ from dev.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | The production postgis service, internal hostname |
| `OTP_URL` | The production OTP service, internal hostname |
| `BETTER_AUTH_URL` | `https://addis.dandii.app` — must match exactly, including scheme |
| `BETTER_AUTH_SECRET` | **Generate a new one.** Do not reuse dev's. Existing sessions will not carry over; everyone signs in again once, which is expected and harmless. |
| `GOOGLE_CLIENT_ID` | Same client as dev — see below |
| `GOOGLE_CLIENT_SECRET` | Same client as dev |
| `SUPER_ADMIN_EMAIL` | Your address. Grants super-admin on first sign-in. |
| `G4A_TAG` | Production analytics tag, or leave unset |
| `RESEND_API_KEY` | Optional. Without it console invitations do not email — the UI falls back to "share this link directly", so every operator invite is hand-delivered. |
| `EMAIL_FROM` | Only if `RESEND_API_KEY` is set. Defaults to `Dandii <no-reply@dandii.et>`; use a domain you control or Resend rejects the send. |

Do **not** set `NEXT_PUBLIC_SITE_URL`. It falls back to `BETTER_AUTH_URL`, every
caller is server-side, and because `NEXT_PUBLIC_` is inlined at build time a
runtime value in Coolify would silently do nothing.

`GTFS_BASE_DIR` and `GTFS_EXPORT_DIR` are handled by the compose file — see
below. `GTFS_DIR`, `PROMO_BASE_URL` and `RUN_DB_TESTS` are seed/script/CI only.

### Host ports — required when two stacks share a VPS

dev and production are separate stacks on the same machine, each running its
own `postgis`, `otp` and `web`. Host port bindings are therefore parameterized;
leaving them at the defaults makes the second stack fail to start with:

```
Bind for 127.0.0.1:8081 failed: port is already allocated
```

Set these on the **production** resource so it does not collide with dev:

| Variable | Dev (default) | Production |
|---|---|---|
| `POSTGIS_BIND` | `127.0.0.1:5433` | `127.0.0.1:5434` |
| `OTP_BIND` | `127.0.0.1:8081` | `127.0.0.1:8082` |
| `WEB_BIND` | `3000` | `127.0.0.1:3001` |

Any free port works; only distinctness matters.

`WEB_BIND` defaults to `3000` with no interface prefix, so the app is reachable
at `VPS_IP:3000` directly, bypassing Traefik and its TLS. Binding production to
`127.0.0.1:3001` closes that — Traefik reaches the container over the Docker
network and never uses the host port. Worth doing on dev too.

Longer term the cleanest answer is to publish no host ports at all and let
Traefik route entirely over the Docker network, keeping the published ports in
a `docker-compose.override.yml` that only local development loads. Coolify
passes `-f docker-compose.yml` explicitly, so it would ignore such an override.
That is a bigger change than unblocking a deploy, so it is not done here.

### Feed storage

Two volumes on the `web` service, both required for feed generation to work:

- `./data:/app/data:ro` — the base GTFS feed the exporter rewrites. The build
  context is `./web`, so `data/` is not in the image; without this mount
  "Generate feed" fails with `Base GTFS feed not found`. The path lands on
  `BASE_DIR_CANDIDATES[1]`, so `GTFS_BASE_DIR` needs no value.
- `gtfs_exports:/app/.gtfs-exports` — generated zips, with
  `GTFS_EXPORT_DIR` pointed at it. The default resolves to `/.gtfs-exports`,
  outside `/app` and outside any volume, so every published version would be
  lost on the next deploy.

The image seeds `/app/.gtfs-exports` owned by `nextjs` before dropping
privileges: Docker initializes an empty named volume from the image path it
mounts over, ownership included, and a root-owned volume fails the first write
as uid 1001.

### Google sign-in: reuse the same OAuth client

This is the decision that makes user migration work or fail.

`Account.accountId` stores Google's `sub`, and `sub` is stable per user **per
OAuth client project**. Create a new Google Cloud project for production and
every migrated user's `sub` changes: their account row no longer matches, and
better-auth silently creates a second, empty user for them.

So do not create a new client. In Google Cloud Console → Credentials → your
existing OAuth 2.0 Client, add one authorized redirect URI:

```
https://addis.dandii.app/api/auth/callback/google
```

Leave the dev URI in place. One client, two redirect URIs, both environments
work and migrated accounts sign in normally.

## Migrating dev data to production

The production database is new and empty; dev holds the working dataset (the
GTFS feed, fares, overrides, users and their contribution history). 34 foreign
key columns point at `user`, so migrating users alone would leave overrides,
proposals, points and badges orphaned. Copy the whole database instead.

Do this **before** the first production deploy, or immediately after — the
dump includes `_prisma_migrations`, so `prisma migrate deploy` on boot sees
every migration already applied and does nothing.

**1. Dump dev** (on the VPS, from the dev postgis container):

```bash
docker exec <dev-postgis-container> pg_dump -U admin -d gtfs_dev_db -Fc -f /tmp/dandii.dump
docker cp <dev-postgis-container>:/tmp/dandii.dump ./dandii.dump
```

**2. Restore into production:**

```bash
docker cp ./dandii.dump <prod-postgis-container>:/tmp/dandii.dump
docker exec <prod-postgis-container> pg_restore -U <prod-user> -d <prod-db> --no-owner --clean --if-exists /tmp/dandii.dump
```

`--no-owner` because the production role name differs from dev's.

**3. Remove the dev-only accounts.** The dump carries test users and their
sessions. List them first, decide, then delete:

```bash
docker exec <prod-postgis-container> psql -U <prod-user> -d <prod-db> -c "SELECT email, role FROM \"user\" ORDER BY role, email;"
```

Delete the ones that should not exist in production. `onDelete: Cascade` on
`Account` and `Session` takes their auth rows with them; audit rows that
reference them will block the delete, which is the correct outcome — a
contribution history with no author is worse than a stale account.

**4. Clear sessions.** They were signed with dev's `BETTER_AUTH_SECRET` and are
useless under the new one:

```bash
docker exec <prod-postgis-container> psql -U <prod-user> -d <prod-db> -c 'DELETE FROM session;'
```

**5. Run the operator-scope gate** before letting anyone in:

```bash
docker compose exec web ./node_modules/.bin/tsx scripts/backfill-operator-codes.ts
```

`OK:` means every `route-operator` has an operator and can open the console.
Any account listed cannot. Assign one with
`--set email@example.com=ANBESSA`, or `--demote email@example.com`.

The production container also runs this check on every boot and prints the
result in the deploy log. It warns and starts anyway: an unscoped dispatcher
is a problem for one person, a container that refuses to boot is a problem for
every rider.

## Note on the OTP graph

Production needs its own `otp-data/` volume with the GTFS zip, same as dev.
OpenTripPlanner rebuilds its graph on restart when the file changes. Journey
planning returns nothing until that graph exists.

## First production deploy

`main` currently sits at v1.3.0. Everything since — per-operator scoping, the
Amharic work, the geometry fix — is on `dev`. Merge `dev` into `main` when you
want production to have it; pushing `main` as it stands today deploys v1.3.0.
