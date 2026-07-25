# Deployment

Dandii ships as three containers defined in the root [`docker-compose.yml`](https://github.com/rabira-hierpa/dandii/blob/main/docker-compose.yml): `postgis`, `otp`, and `web`. It's designed to run on a VPS behind Coolify (Traefik for domain/TLS), but the same compose runs anywhere Docker does.

## Services

| Service | Image / build | Port (host) | Role |
|---|---|---|---|
| `postgis` | `postgis/postgis` | `127.0.0.1:5433` → 5432 | Database (source of truth). Named volume `postgis_data`. |
| `otp` | `opentripplanner/opentripplanner:latest` | `127.0.0.1:8081` → 8080 | Journey planning. Builds its graph from `otp-data/` on boot. |
| `web` | `build: ./web` (multi-stage, standalone) | `3000` | The Next.js app. Depends on postgis (healthy) + otp (started). |

## Environment

The `web` service reads these from the shell / Coolify env (compose interpolates them):

```bash
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://your-domain
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SUPER_ADMIN_EMAIL=you@example.com
```

`DATABASE_URL` and `OTP_URL` are set to the internal container addresses inside the compose file (`postgis:5432`, `otp:8080`) — you don't override them for the standard topology. Full list: [Configuration](Configuration).

## First deploy

```bash
# On the host, with the env vars above exported (or in Coolify's env panel):
docker compose up -d --build
```

Then migrate and seed **inside the web container** (or from a host with `DATABASE_URL` pointing at the DB):

```bash
docker compose exec web sh -lc "npx prisma migrate deploy && npm run db:seed"
```

Google OAuth redirect URI for production must be `https://your-domain/api/auth/callback/google`.

## Coolify notes

- Point Traefik at the `web` service for domain + TLS; keep `postgis` and `otp` internal (no public ports).
- Use named volumes so the DB and OTP graph survive redeploys.
- Set the env vars in Coolify's environment panel, not committed to the repo.

## OpenTripPlanner graph

The `otp` service runs `--build --save --serve`, rebuilding its graph from the GTFS zip in `otp-data/` on start (~2 min). Because the `:latest` image tracks a rolling dev-2.x snapshot, its graph serialization format can change between pulls — always rebuild from the zip rather than loading a stale `graph.obj`, or OTP refuses to start with a "serialization version id" mismatch. To speed restarts, pin the image to a fixed digest and switch to `--load --serve`.

**Rebuild the trip planner after a network change:** replace the zip in `otp-data/` and restart the `otp` container. Fare edits never require this — only route/stop/trip changes do.

```bash
docker compose restart otp
```

## Generated GTFS exports

Feed versions are written to `GTFS_EXPORT_DIR` (default `.gtfs-exports/`). In production, mount that on a persistent volume so downloads survive redeploys; the download endpoint returns `410 Gone` for a version whose file was pruned or lost. See [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions).

## Related

- [Configuration](Configuration) · [Getting Started](Getting-Started) · [Troubleshooting](Troubleshooting)
