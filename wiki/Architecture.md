# Architecture

Dandii is a single Next.js application backed by PostgreSQL and OpenTripPlanner, deployed as three containers. This page explains how the pieces fit together and why.

## The monorepo

```
dandii/
├── data/gtfs-2026/        # DT4A feed: combined feed + bus/minibus sub-feed zips
├── otp-data/              # GTFS zip OTP builds its graph.obj from (transit-only)
├── web/                   # the Next.js app (see web/CLAUDE.md)
│   ├── prisma/            # schema, migrations, GTFS seed pipeline
│   ├── scripts/           # CI helpers (feed generation, validator diff gate)
│   ├── e2e/               # Playwright specs
│   └── src/
│       ├── app/           # routes: public map, console, settings, profile, api
│       ├── actions/       # server actions (fares, closures, assignments, proposals, feed)
│       ├── components/    # base (Untitled UI), console, map
│       ├── lib/           # auth, permissions, prisma, gtfs-export, account, transit helpers
│       ├── generated/     # Prisma client (generated; not hand-edited)
│       └── stores/        # zustand client stores (map UI state only)
└── docker-compose.yml     # postgis + otp + web
```

## Runtime topology

```
                 ┌──────────────────────────────────────────────┐
   Browser  ───▶ │  web  (Next.js 16, standalone)  :3000         │
                 │   • Public map, console, settings, profile    │
                 │   • Server actions + API route handlers       │
                 │   • better-auth (session cookies)             │
                 └───────────────┬───────────────┬──────────────┘
                                 │ Prisma        │ HTTP (GraphQL)
                                 ▼               ▼
                 ┌───────────────────────┐   ┌───────────────────────┐
                 │ postgis  :5432 (5433) │   │ otp  :8080 (8081)     │
                 │ source of truth:      │   │ journey planning over │
                 │ routes, fares, users, │   │ the GTFS graph (read  │
                 │ proposals, feed rows  │   │ only, rebuilt on boot)│
                 └───────────────────────┘   └───────────────────────┘
```

- **Postgres is the source of truth.** Approved fares, closures, assignments, proposals, and feed-version rows all live here. The public map reads live data from the DB.
- **OTP is a read-only routing engine.** It answers "how do I get from A to B" over the GTFS graph. Fare edits do not change the routing graph, so OTP only needs rebuilding when the network (routes/stops/trips) changes, not when a fare changes.
- **GTFS zips are versioned exports**, generated in-app from the DB. They are for downstream consumers, not for the live app. See [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions).

## Request and data flow

**Reading the network (anonymous):**

```
GET /api/geo/routes  ─▶  cached FeatureCollection (simplified geometry, operator, closed flag)
GET /api/search?q=   ─▶  routes + stops matching the query
GET /api/routes/[id] ─▶  full route detail (stops, headways, live fare, closure)
POST /api/otp        ─▶  proxy to OTP GraphQL (avoids browser CORS)
```

**Writing (staff or signed-in riders):** all mutations go through **server actions** in `src/actions/`, never raw API routes. Each action re-checks permissions with better-auth before touching the DB. Fares specifically funnel through one permission-free helper, `applyFareChange()`, which every write path (console edit, proposal approval, reseed) shares so the audit log is always written.

## Authentication and authorization

Three enforcement layers, defense in depth:

1. **Proxy** (`proxy.ts`, the Next 16 replacement for middleware) — cookie gate that redirects unauthenticated users away from `/console` and `/settings`.
2. **Server layouts** — `requireRole()` re-checks the session and minimum role on the server before rendering console/settings pages.
3. **Server actions** — every mutating action calls `requirePermission()` (better-auth `userHasPermission`) for the specific capability it needs.

Roles and the access-control statement are defined in `src/lib/permissions.ts`. See [Roles and Permissions](Roles-and-Permissions).

## Why these choices

- **MapLibre GL (WebGL), not Leaflet.** All 447 route shapes render from one GeoJSON source. Leaflet's SVG polylines would choke on hundreds of thousands of shape points.
- **Geometry precomputed on the `Route` row**, not a 253k-row shape table. The seed stores full + simplified GeoJSON per route; the map serves the simplified collection with `s-maxage` caching.
- **Prisma driver adapter (`@prisma/adapter-pg`).** Works with the standard `pg` pool; partial-unique indexes (e.g. "one pending proposal per user per route") are added via a raw-SQL migration since Prisma can't express them natively.
- **Fares live in the DB, decoupled from GTFS export.** Approved fares are visible immediately; generating a feed version is a separate, deliberate maintainer action. Downstream consumers never gate rider-visible accuracy.

## Related

- [Data Model](Data-Model) — the tables behind all of this
- [GTFS Data and Seeding](GTFS-Data-and-Seeding) — how the DB gets populated
- [Crowdsourced Fares](Crowdsourced-Fares) — the write path in depth
