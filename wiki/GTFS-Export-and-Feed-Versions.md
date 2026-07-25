# GTFS Export and Feed Versions

Dandii generates versioned GTFS zips so downstream consumers (other apps, agencies, researchers) can use the crowdsourced fares. This is a **fares overlay** exporter: it copies the vendored base feed byte-for-byte and replaces only the fare files. Code: `web/src/lib/gtfs-export.ts`.

## What a generated version contains

The zip is the base combined feed with exactly three files added/replaced:

1. **`fare_attributes.txt`** + **`fare_rules.txt`** — regenerated from the live `Fare` table. Each FLAT fare becomes one attribute row (`price`, `currency_type=ETB`, `payment_method=0`, empty `transfers`) and one rule row keyed by `route_id` (`fare_id = f_<routeId>`).
2. **`feed_info.txt`** — `feed_publisher_name` set to Dandii and `feed_version` bumped to `dandii-v<N>`.

Everything else — `routes.txt`, `stops.txt`, `trips.txt`, `stop_times.txt`, `frequencies.txt`, `shapes.txt`, `calendar.txt`, `agency.txt` — passes through unchanged. The export can never lose data the DB doesn't hold (shapes, for example, are not stored per-point in the DB).

## Design decisions

- **Tiered fares are omitted (4A).** GTFS Fares V1 without stop zones can carry only one price per route. Exporting a tier ceiling would overstate short trips, so tiered routes carry no V1 fare (honest "unknown") until phase-2 zone synthesis. They still render in Dandii's own UI.
- **Only base-feed routes are exported.** Fares for console-created routes whose ids aren't in the base `routes.txt` are filtered out. Emitting a `fare_rules` row for a non-existent `route_id` is a GTFS `foreign_key_violation` — this filter was added after the CI validator gate caught exactly that.
- **Generation is synchronous.** It's file copies plus two small generated files, well under a second. The `FeedVersion` row is written in the same action.
- **Versions are pruned.** The newest 10 zip files are kept on the volume; older zip *files* are removed but their DB rows stay for audit.

## How to generate a version (UI)

Console → **Feed Versions** (`/console/feeds`) → **Generate version**. Requires `feed:generate`. See [Operations Console](Operations-Console).

## How to generate a version (CI/script)

```bash
cd web
npx tsx scripts/generate-feed.ts
# prints: {"version":N,"label":"vN","sizeBytes":...,"fareChangeCount":...,"routeCount":...}
```

Output zips land in `GTFS_EXPORT_DIR` (default: repo-root `.gtfs-exports/`, gitignored).

## Downloading

`GET /api/feeds/<version>/download` streams the zip (console roles only):

- **200** — the zip, `Content-Disposition: attachment; filename="dandii-gtfs-v<N>.zip"`.
- **404** — unknown version.
- **410 Gone** — the row exists but its file was pruned from the volume.

## The change-report cursor

Each `FeedVersion` records `lastChangeLogId` — the newest `FareChangeLog` id included. The next version's `fareChangeCount` counts changes after that cursor, so consecutive versions report exactly what changed between them with no time-window races.

## The validator gate (CI)

The MobilityData canonical GTFS validator runs in CI, not in the web image (no JVM in production). The gate (`web/scripts/validate-feed-diff.mjs`) compares two validator reports:

- **baseline** = the base combined feed's own report
- **candidate** = the generated overlay feed's report

Rule: **fail if any ERROR-severity notice code exceeds its baseline count.** In other words, the overlay must not introduce errors the base feed didn't already have. WARNING/INFO never fail the gate.

```bash
node scripts/validate-feed-diff.mjs base-report.json overlay-report.json
# ✓ passes with exit 0, or ✗ prints the regressed codes and exits 1
```

See [Development and Testing](Development-and-Testing) for the full CI job.

## Rebuilding the trip planner

Feed generation does **not** rebuild OTP. Fares don't change the routing graph, so OTP only needs a rebuild when the network changes (a documented "rebuild trip planner" step: restart the `otp` container). See [Deployment](Deployment).

## Related

- [Crowdsourced Fares](Crowdsourced-Fares) · [GTFS Data and Seeding](GTFS-Data-and-Seeding) · [Data Model](Data-Model#feedversion)
