# Menged — Addis Ababa Public Transport Route Management

Menged is a role-based public transport route management system for Addis
Ababa, built on the DT4A **GTFS 2026** feed (447 routes: Anbessa, Sheger,
Alliance, Minibus associations, and Addis LRT). It ships a public
Google-Maps-style transit map with journey planning, and a network
operations console for transport officials.

## Features

- **Public map** (`/`) — all 447 route shapes on a WebGL map, route/stop
  search, route detail sheet (stops, headways, fares, closure banners),
  and an OpenTripPlanner-powered journey planner.
- **Operations console** (`/console`) — Agency Overview, Route Assignment
  (map route_ids to operators), Network Map (open/close routes with a
  reason and date range), and Fare Management (flat vs tiered ETB pricing).
- **Settings** (`/settings`) — profile, member/role management, and system
  info.
- **RBAC** — four staff roles (`super-admin`, `admin`, `route-operator`,
  `maintainer`) enforced in middleware, server layouts, and every server
  action via better-auth's admin plugin with a custom access-control
  statement.

## Tech stack

- **Web**: Next.js 16 (App Router, standalone output), TypeScript,
  Tailwind v4, Untitled UI components
- **Map**: MapLibre GL JS + react-map-gl, OpenFreeMap basemap (no API key)
- **Auth**: better-auth + Google OAuth + Prisma adapter
- **DB**: PostgreSQL (PostGIS image), Prisma ORM
- **Journey planning**: OpenTripPlanner 2.x (GTFS GraphQL API)
- **Forms/state**: react-hook-form + zod, Zustand

## Project structure

```
menged/
├── data/gtfs-2026/        # DT4A feed: combined + bus/minibus sub-feed zips
├── otp-data/              # OSM extract + GTFS zip; OTP builds graph.obj here
├── web/                   # Next.js app
│   ├── prisma/            # schema, migrations, GTFS seed pipeline
│   └── src/
│       ├── app/           # public map, console, settings, API routes
│       ├── actions/       # server actions (assignments, fares, closures)
│       ├── components/    # ui (Untitled UI), console, map
│       ├── lib/           # auth, permissions, prisma, transit helpers
│       └── stores/        # zustand client stores
└── docker-compose.yml     # postgis + otp + web
```

## Getting started (local dev)

1. Start PostGIS and OTP:

   ```bash
   docker compose up -d postgis otp
   ```

   OTP rebuilds its graph from `otp-data/` on first start (~2 min).
   Use the `latest` OTP image (see `docker-compose.yml`) — older 2.6/2.7
   builds crash on frequency-based GTFS feeds when planning trips.

2. Configure the app:

   ```bash
   cd web
   cp .env.example .env   # fill in Google OAuth credentials + secrets
   npm install
   npx prisma migrate dev
   npm run db:seed        # imports the GTFS 2026 feed (~10 s)
   ```

3. Run it:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. Sign in with Google — the account matching
   `SUPER_ADMIN_EMAIL` becomes super-admin and can open `/console`.

## Environment variables (`web/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public origin (http://localhost:3000 in dev) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials; redirect URI is `<origin>/api/auth/callback/google` |
| `SUPER_ADMIN_EMAIL` | First user with this email becomes super-admin |
| `OTP_URL` | OpenTripPlanner origin (http://localhost:8081 in dev — host port 8081 avoids clashing with other apps on 8080) |

## Production (Docker / Coolify)

```bash
BETTER_AUTH_SECRET=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
SUPER_ADMIN_EMAIL=… docker compose up --build -d
```

The `web` image runs `prisma migrate deploy` on boot. Seed the database
once from your machine against the production `DATABASE_URL`:

```bash
cd web && DATABASE_URL=postgresql://… npx tsx prisma/seed/index.ts
```

On Coolify, expose only the `web` service (Traefik handles the domain and
TLS); `postgis` and `otp` stay internal.

## Updating the GTFS feed

Drop the new feed into `data/gtfs-2026/` (combined extracted + sub-feed
zips), re-run `npm run db:seed`, and replace the zip in `otp-data/`
(the filename must contain `gtfs`) so OTP rebuilds its graph on restart.

## Acknowledgements

- [Digital Transport for Africa](https://digitaltransport4africa.org/) for the Addis Ababa GTFS feed
- [OpenTripPlanner](https://www.opentripplanner.org/) for the routing engine
- [OpenFreeMap](https://openfreemap.org/) for the basemap tiles
