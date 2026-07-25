# Troubleshooting

Common failures and their fixes. Most come from the Next.js 16 / Prisma / OTP specifics of this project.

## Database

**`Can't reach database server at localhost:5432`**
The compose maps PostGIS to host port **5433**, not 5432. For host dev, set `DATABASE_URL=...@localhost:5433/gtfs_dev_db`. Inside the `web` container it's `postgis:5432`. See [Configuration](Configuration).

**`prisma.<model>` is undefined at runtime (e.g. `Cannot read properties of undefined`)**
The generated Prisma client is stale. Run `npx prisma generate` (or `npm run db:migrate`) and **restart `next dev`** — the running server caches the client in memory, so a hot reload isn't enough.

**Seed fails with "schema not found"**
Run seed/prisma commands from `web/` (that's where `schema.prisma` and `.env` live): `cd web && npm run db:seed`.

**A reseed wiped my fares**
Preserve mode is the default and never deletes fares. If fares were reset, the seed was run with `--destructive`. The preserve invariant is covered by a regression test (see [Development and Testing](Development-and-Testing)); if a plain `db:seed` loses fares, that's a bug — check you didn't pass `--destructive`.

## OpenTripPlanner

**OTP won't start: "serialization version id" mismatch**
The `:latest` image changed its graph format. Delete any cached `graph.obj` in `otp-data/` and let it rebuild from the GTFS zip (`--build --save --serve`), or pin the image to a fixed digest. See [Deployment](Deployment).

**Journey planner returns no itineraries**
OTP is transit-only (no street graph), so it routes stop-to-stop. Endpoints must snap to real stops — "use my location" snaps to the nearest stop. Also confirm `OTP_URL` is reachable from the web app (`http://localhost:8081` on host, `http://otp:8080` in compose).

## Auth / sign-in

**Google sign-in fails or loops**
The redirect URI must exactly match: `<BETTER_AUTH_URL>/api/auth/callback/google`. Each environment needs its own URI registered in Google Cloud Console. Confirm `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are set.

**Signed in but can't reach `/console`**
Console access needs a console role. The first super-admin is the account matching `SUPER_ADMIN_EMAIL` at first login. Promote others via Settings → Members. See [Roles and Permissions](Roles-and-Permissions).

## Build / lint

**ESLint: "Calling setState synchronously within an effect"**
The `react-hooks/set-state-in-effect` rule. Don't `setState` directly in an effect body. Use render-time sync (compare a stored previous prop) or `useSyncExternalStore` for external state (localStorage pattern in `lib/recent-searches.ts`).

**Icon import fails at runtime ("Export X doesn't exist")**
`@untitledui/icons` exports specific names; a typo (e.g. `Pencil03` vs `Pencil02`) compiles under `tsc` but breaks Turbopack. Import an existing icon name.

## GTFS export / validator gate

**Validator gate fails with `foreign_key_violation` in `fare_rules.txt`**
A fare exists for a route id not present in the base feed's `routes.txt` (typically a console-created `manual-…` route). The exporter filters these out; if you see this, confirm you're on a build with that filter (`selectFlatFares` + base-route filtering in `lib/gtfs-export.ts`).

**`410 Gone` downloading a feed version**
The `FeedVersion` row exists but its zip file was pruned (only the newest 10 are kept) or the volume was recreated. Regenerate the version to get a fresh file.

## Ports

**Port already in use (3000 / 5433 / 8081)**
Another process holds the port. Stop it, or change the mapping in `docker-compose.yml` / your dev command. PostGIS (5433) and OTP (8081) use non-default host ports specifically to avoid clashes.

## Related

- [Getting Started](Getting-Started) · [Development and Testing](Development-and-Testing) · [Configuration](Configuration)
