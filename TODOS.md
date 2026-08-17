# TODOS

## P1 — Deferred from fare-registry plan (ship 2026-07-23)

- [ ] Console fare-history UI (FareChangeLog exists; no console surface yet)
- [ ] Unit/integration tests for fare-proposal action guards (dedup, rate limit, double-decision)
- [ ] Playwright authenticated wedge: submit → approve → fare on sheet → export

## P1 — Planner ignores direction on partial closures (found 2026-08-12)

`isPairClosed` matches closures by stop id, but 406 of the 444 two-direction
routes share NO stop ids between their directions. So closing a stretch almost
certainly blocks only the direction whose stop ids the operator picked and
leaves the return journey planning as if the road were open. Unverified at
runtime — the map path was fixed in T0 by falling back to geometry, and the
planner needs the same treatment (or a stop-cluster concept, which would also
fix search grouping and the T3b cascade).

## P2 — Deferred from partial-closures autoplan (2026-08-07)

- [ ] Road-segment cascade: one physical blockage → all routes serving that segment
- [ ] Multi-route “apply same closed stop range” helper (ops shortcut before full cascade)
- [ ] Playwright: console create SEVERED → map split → directions open-leg / spanning OD
      (all four verified manually against the dev DB on 2026-08-10; only the
      browser-level console form submit is still unexercised)
- [ ] Short TTL cache for active closures on the directions hot path

## P1 — Batch D (route/stop editor), in progress 2026-08-10

- [x] Foundation: StopOverride/RouteOverride + migration, RBAC `feedEdit`,
      seed apply-overrides, export regen for stops.txt/routes.txt
- [ ] Apply/Publish pipeline: regenerate zip → reseed DB → rebuild OTP graph,
      explicit batched Publish button + "live as of version N" badge (admin+)

Route tabs + full CRUD (locked 2026-08-12, docs/route-editor-design.md part 2).
Tabs: Details | Stops | Trips | Service. Costs/Coverage dropped, Shapes deferred.
- [ ] T0: provenance (Route/Stop.origin, tombstones, Trip.directionId) + the three
      foundation corrections — scoped deleteMany, tombstone-aware apply, CSV
      rewriters that append operator rows. MUST land before T1.
- [x] T1: tab shell + Details (5a) + create/duplicate/delete route
- [x] T2: Stops tab — ordered list, rename (5c-rename), create/delete stop
- [x] T3: Trips tab (editable block_id via TripOverride) + Service tab.
      network-map.tsx is 1171 -> 731 lines and complexity 51 -> 17. Both it and
      route-service-tab sit at 17 against the limit of 15 — worth a second pass.
- [ ] Route "+ Add route" entry point: createRoute action exists and is tested
      by duplicate, but nothing in the UI calls it yet
- [ ] T3b: cascade switch — affected-route count (distinct, max 26 at Torhayloch)
      + grouped closures sharing a cascadeId, reopened together
- [ ] T4: stop reordering (5b — TripStopOverride + stop_times regen)
Shape drawing (5c-shape, docs/route-editor-design.md). Snapping reuses the OTP
graph in CAR mode — verified 6,067m road-following vs 4,138m straight-line.
- [x] S1: /api/console/snap + ShapeOverride + saveRouteShape (server-side re-snap)
- [x] S2: Shapes tab + right-click "Edit shape" -> draw mode with live snapped
      preview, waypoint add/remove, dashed rendering for unsnapped segments.
      **Absorbed T5** — /autoplan 2026-08-16 found right-click alone cannot reach
      a route with no line (the console map draws only trips with a shapeId), so
      a newly created route could never get one drawn. Shapes tab is the home;
      right-click is the shortcut. Also added: baseGeojson + "reset to feed
      shape", a trip-less-direction refusal (was a silent ok:true), an 8s OTP
      timeout, a concurrency cap of 6, and a per-operator snap throttle.
      54 new tests. network-map.tsx is finally under the complexity limit
      (17 -> 21 -> under) after extracting route-tab-body and use-route-hover.
- [ ] S3: apply-overrides replays ShapeOverride; export regenerates shapes.txt
- [x] Restore corrupted punctuation in network-map.tsx

Deferred from the S2 autoplan (2026-08-16):
- [ ] P2 — Playwright E2E: draw -> save -> export contains the drawn shapes.txt.
      Needs S3 to assert against; no Playwright config exists in web/ yet.
- [ ] P3 — Shape history. `ShapeOverride` keeps only the current edit; there is
      no `FareChangeLog` equivalent for geometry, so a bad shape can be reset to
      the feed but not to the previous operator edit. Needs its own model.

Shape collapse folded into T0: store both directions in a `Shape` model; public
map shows inbound only, console shows both (amended 2026-08-12).

Coding-standards debt from the 2026-08-12 CLAUDE.md rules (14 files ours, 24
vendored Untitled UI files exempt):
- [ ] One component per file: 14 of our .tsx files declare 2+ components
      (public-map, network-map, directions-panel, library-rail, charts, …)
- [ ] `src/types/` now exists (gtfs.ts, console.ts); older `types.ts` barrels
      and inline interfaces still to migrate
- [ ] 142 useState call sites vs 2 zustand stores
