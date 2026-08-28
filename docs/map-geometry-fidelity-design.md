# Map geometry fidelity (and the basemap question)

Branch `feat/map-geometry-fidelity`, opened 2026-08-18 from `feat/partial-closures`.

## The report

> "The public map and the network map seem misaligned with the base map. GTFS-X
> aligns well — the routes are snapped to the OSM road network perfectly."

The symptom is real. The cause is not the basemap.

## What is actually happening

Both maps render `geojsonSimplified`, never the full shape:

- `app/api/geo/routes/route.ts:121,133` — `geometry: r.geojsonSimplified`
- `lib/route-shape-features.ts:134` — `coordinates: shape.simplified`

That geometry is produced in `prisma/seed/build-geojson.ts:41` with
`SIMPLIFY_TOLERANCE = 0.0001` degrees through Douglas-Peucker, which is about
11 metres at Addis latitude.

Measured over 58 shapes / 10,406 points against the stored full geometry:

| Measure | Value |
|---|---|
| Vertices kept | 12.2% (283 → 35 per shape) |
| Deviation p50 | 2.2 m |
| Deviation p90 | 6.9 m |
| Deviation p99 | 10.1 m |
| Deviation max | 13.8 m |
| Road >5 m from the drawn line | 20.3% |
| Longest straight chord | 3,398 m |

At z17 (~1.2 m/px) that is a 6-12 pixel offset, and a curve reduced to 12% of
its vertices renders as a visible polygon — which is exactly the shape cutting
across the Megenagna roundabout in the report screenshot.

The repo already knew simplification was too coarse, in a comment written for a
different bug (`api/geo/routes/route.ts:184`): "Slice the FULL shape, not
`geojsonSimplified`. Simplification leaves ~500m between vertices." Partial
closures were fixed by reaching for the full shape. The rendered line never was.

## Why a basemap switcher would not fix it

openfreemap Positron and a self-hosted Addis extract are both OSM rendered in
EPSG:3857. Swapping one for the other moves the basemap, not the orange lines.
The lines would land in exactly the same wrong place.

## Where the basemap instinct IS right

OTP builds its graph from `otp-data/addis.osm.pbf` (2026-07-26). The basemap is
openfreemap's own snapshot. Two OSM vintages: a road edited between them exists
in one and not the other. Rendering the basemap from the same PBF OTP routes on
would make "snapped to a road" provably mean "on a road you can see". That is a
real second-order effect, dwarfed by an 11 m simplification tolerance.

## Payload, measured

| Surface | Simplified | Full @5dp (~1 m) | Ratio |
|---|---|---|---|
| Public map (448 routes) | 0.34 MB | 2.26 MB | 6.6x |
| Console map (891 shapes, both directions) | 0.68 MB | 4.53 MB | 6.7x |

Uncompressed JSON. Coordinate arrays gzip well, but this is why "just always
serve full" is not automatically the answer.

## Effort for the basemap work (asked directly, answered regardless)

**Vector, self-hosted, Addis only — feasible and bounded.** `addis.osm.pbf` is
already in the repo. planetiler or tilemaker produces PMTiles; the `pmtiles` JS
protocol reads it as a static file, so there is no tile server and no new
container. Human ~3-4 days / CC ~2-3h, plus 100-300 MB of storage.

**Satellite, self-hosted — a licensing problem, not an engineering one.** No
free redistributable high-resolution imagery exists. Sentinel-2 is open at
10 m/px, useless for judging whether a line sits on a road. Planet NICFI covers
Ethiopia at ~4.7 m with registration and ToS limits. Esri World Imagery, Bing
and Mapbox either forbid caching or charge. "Self-hosted satellite" resolves to
*buy imagery*. Proxying a commercial tile URL with a key is ~half a day, and is
not self-hosting.

## Decision

Premise gate (2026-08-18): **fix the geometry first, judge the basemap after**,
with the alignment noise removed.

## Tolerance curve (measured, 119 routes)

| tolerance | pts/route | p90 dev | max dev | est payload |
|---|---|---|---|---|
| 0.0001 (current) | 27 | 6.8 m | 11.0 m | 0.22 MB |
| 0.00003 | 55 | 2.2 m | 3.3 m | 0.44 MB |
| **0.00001 (chosen)** | **102** | **0.7 m** | **1.1 m** | **0.82 MB** |
| 0.000003 | 160 | 0.2 m | 0.3 m | 1.29 MB |
| 0 (full) | 234 | 0 | 0 | 1.87 MB |

Production also runs `highQuality: false`, which is why stored data measures
13.8 m max where this curve shows 11.0 m at the same tolerance. Switching to
`true` is a free accuracy win.

## The landmine

`saveRouteShape` writes `geojsonSimplified: geojson` — an operator-drawn shape
is stored at full resolution in BOTH columns. The backfill must skip any row
carrying a `ShapeOverride`, or it will re-simplify an operator's exact drawing
and silently degrade work they verified against the road network.

`lengthMeters` is computed from the FULL line, so retuning tolerance cannot move
route lengths or fare tiers.

## Chosen approach

`SIMPLIFY_TOLERANCE` 0.0001 -> 0.00001, `highQuality` false -> true, plus a
one-off backfill that recomputes `geojsonSimplified` from the stored `geojson`
and skips override-carrying rows. No reseed, so no risk to operator edits.

## NOT in scope

- Basemap switcher (vector or satellite) — judged after the alignment noise is gone.
- Vector tiles for route geometry — premature at 448 routes.
- Zoom-gated resolution — the machinery a constant makes unnecessary.
- Apply/Publish pipeline, fare-history UI, closure TTL cache, coding-standards debt.

## Decision Audit Trail

| # | Phase | Decision | Class | Principle |
|---|---|---|---|---|
| 1 | CEO | Premise P2 rejected: basemap is not the cause | **user-confirmed** | evidence |
| 2 | CEO | Approach B (retune + backfill) over A (zoom-gate) and C (tiles) | taste | P5+P3 |
| 3 | CEO | Tolerance 0.00001, not 0.00003 or 0.000003 | mechanical | P1 |
| 4 | CEO | highQuality true | mechanical | P1 |
| 5 | CEO | Backfill instead of full reseed | mechanical | P2 |
| 6 | CEO | Scope = geometry + P1 planner bug + S3; rest deferred | taste | P3 |
| 7 | Design | Loading affordance for the denser console payload | mechanical | P1 |
| 8 | Design | One tolerance for both maps, not two resolutions | mechanical | P3 |
| 9 | Eng | Backfill skips ShapeOverride rows | **mandatory** | correctness |
| 10 | Eng | Regression test asserting lengthMeters unchanged | mandatory | P1 |
