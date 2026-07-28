# Configuration

Dandii is configured through environment variables. Locally these live in `web/.env` (copy `web/.env.example`); in Docker/Coolify they're passed to the `web` service. See [`web/.env.example`](https://github.com/rabira-hierpa/dandii/blob/main/web/.env.example).

## Web app variables

| Variable | Required | Example / default | What it does |
|---|:---:|---|---|
| `DATABASE_URL` | ✅ | `postgresql://admin:adminpassword@localhost:5433/gtfs_dev_db` | Postgres connection. **Host dev uses port 5433** (the compose host mapping); the `web` container uses `postgis:5432`. |
| `BETTER_AUTH_SECRET` | ✅ | `openssl rand -base64 32` | Signs session cookies. Set a strong value in every environment. |
| `BETTER_AUTH_URL` | ✅ | `http://localhost:3000` | Base URL better-auth uses for callbacks. |
| `NEXT_PUBLIC_SITE_URL` | — | `http://localhost:3000` | Public site URL for share links / absolute URLs (exposed to the browser). |
| `OTP_URL` | ✅ | host: `http://localhost:8081` · container: `http://otp:8080` | OpenTripPlanner GraphQL endpoint the `/api/otp` proxy calls. |
| `GOOGLE_CLIENT_ID` | sign-in | — | Google OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | sign-in | — | Google OAuth client secret. |
| `SUPER_ADMIN_EMAIL` | sign-in | — | The Google account bootstrapped as `super-admin` on first login. |

Sign-in-only variables are not needed to run the public map; they're required for authentication and the console.

## Export / seed variables (optional overrides)

| Variable | Default | What it does |
|---|---|---|
| `GTFS_DIR` | repo-root `data/gtfs-2026` | Where the seed reads the vendored feed. |
| `GTFS_BASE_DIR` | probed: `<cwd>/data/gtfs-2026/combined` or `<cwd>/../data/gtfs-2026/combined` | Base feed the exporter copies. |
| `GTFS_EXPORT_DIR` | repo-root `.gtfs-exports/` | Where generated GTFS zips are written (a volume in prod). |

## Google OAuth setup

1. Create an OAuth 2.0 Client (Web application) in Google Cloud Console.
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production URL).
3. Put the client id/secret in `web/.env`, set `SUPER_ADMIN_EMAIL`, and restart.

Each environment needs its own exact redirect URIs (localhost + production domain).

## Ports (local Docker)

| Service | Container port | Host port | Notes |
|---|---|---|---|
| PostGIS | 5432 | **5433** (`127.0.0.1` only) | Avoids clashing with a local Postgres. |
| OTP | 8080 | **8081** (`127.0.0.1` only) | Avoids clashing with other 8080 apps. |
| web | 3000 | 3000 | |

## Related

- [Getting Started](Getting-Started) · [Deployment](Deployment) · [Roles and Permissions](Roles-and-Permissions)
