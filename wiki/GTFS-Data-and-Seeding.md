# GTFS Data and Seeding

Dandii is built on the official Addis Ababa **GTFS 2026** feed published under Digital Transport for Africa (DT4A) by World Resources Institute (WRI) Africa. This page explains what the feed contains, how operators are derived from it, and how the seed loads it into Postgres.

## The vendored feed

`data/gtfs-2026/` holds:

- `et-addisababa_2026.zip` — the **combined** feed: 447 routes (2 LRT + 445 bus/minibus), 2270 stop rows, 891 frequency-based trips, ~253k shape points.
- `et-addisababa-bus_2026.zip` — the bus sub-feed (194 routes).
- `et-addisababa-minibus_2026.zip` — the minibus sub-feed (251 routes).
- `combined/` — the extracted combined feed the seed reads (`routes.txt`, `stops.txt`, `trips.txt`, `stop_times.txt`, `frequencies.txt`, `shapes.txt`, `calendar.txt`, `agency.txt`, `feed_info.txt`).

The seed's feed directory is resolved from `GTFS_DIR` when set; otherwise it probes both cwd layouts the seed runs under (dev server cwd = repo root, `data/gtfs-2026` a child; standalone Docker cwd = `/app`, feed bind-mounted at `/app/data`) — same idea as `GTFS_BASE_DIR` in [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions). No manual override needed in the standard compose topology.

## Deriving operators

The combined feed has a single GTFS agency, but the real operators are recoverable. The seed classifies each route into one of five operators:

| Operator | How it's identified | Count |
|---|---|---|
| **Addis LRT** | `route_type = 0` (light rail) | 2 |
| **Minibus associations** | route id present in the **minibus** sub-feed (`Tx*`, `Lafto*`, `Kolfe*`, `LK*`) | 251 |
| **Anbessa City Bus** | in the **bus** sub-feed, prefix `AB*` | 122 |
| **Sheger** | in the bus sub-feed, prefix `SH*` | 46 |
| **Alliance** | in the bus sub-feed, prefix `A/B/C/D##` | 26 |

GTFS CSVs have inconsistent column order across the sub-feeds, so parsing is **header-based** (via papaparse), never positional.

## The seed pipeline

`web/prisma/seed/`:

- `parse-gtfs.ts` — header-based CSV parsing; streams the large `stop_times.txt` / `shapes.txt`.
- `build-geojson.ts` — groups shape points per `shape_id`, maps route→shape via the first trip, simplifies with `@turf/simplify` and measures length with `@turf/length`. Both full and simplified GeoJSON are stored on the `Route` row.
- `index.ts` — orchestrates: classify operators → insert in dependency order → seed default fares (bus flat, LRT/minibus tiered) so Fare Management opens populated.

Run it:

```bash
cd web
npm run db:seed
```

Expected output:

```
447 routes · 5 operators (Anbessa 122 / Sheger 46 / Minibus 251 / Alliance 26 / LRT 2)
2270 stop rows · 891 frequency-based trips
```

## Idempotency and fare preservation (important)

The seed is **idempotent** and **fare-preserving by default**. This is the T0 safety invariant: an operator re-running the seed must never silently discard crowdsourced fares.

- **Default (preserve) mode** — upserts agencies, operators, and routes; rebuilds the transit-graph children (trips, stop_times, frequencies, calendars, stops). It does **not** delete `Fare`, `FareProposal`, `FareTier`, or `RouteClosure` rows. Default fares are only seeded when none exist yet.
- **`--destructive` mode** — wipes and reseeds everything, including fares.

```bash
npm run db:seed                 # preserve (safe default)
npx tsx --env-file-if-exists=.env prisma/seed/index.ts --destructive   # full wipe + reseed
```

A reseed records one summary `FareChangeLog` row with `source = RESEED`.

> This behavior is guarded by a **regression test** — see [Development and Testing](Development-and-Testing). The test stamps a sentinel fare, reseeds in preserve mode, and asserts the sentinel survives; then reseeds `--destructive` and asserts it's reset.

## Serving geometry to the map

The map does not query the DB per route. `GET /api/geo/routes` serves the **simplified** FeatureCollection with `{ routeId, shortName, operatorCode, closed }` properties and an `s-maxage=3600` cache header. Full geometry for a selected route comes from `GET /api/routes/[id]`. See [API Reference](API-Reference).

## Rebuilding the OTP graph

OTP builds its routing graph from `otp-data/` on boot (`--build --save --serve`). If you replace the GTFS zip in `otp-data/`, restart the `otp` container to rebuild. Fare edits never require an OTP rebuild — only network changes (routes/stops/trips) do.

## Related

- [Data Model](Data-Model) · [Architecture](Architecture) · [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions)
