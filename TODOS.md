# TODOS

## P1 — Deferred from fare-registry plan (ship 2026-07-23)

- [ ] Console fare-history UI (FareChangeLog exists; no console surface yet)
- [x] Unit/integration tests for fare-proposal action guards — 16 tests covering
      the rolling-24h limit, the partial-unique dedup translation (and that it
      does NOT swallow unrelated DB errors), the double-decision status guard,
      the per-route advisory lock, and the sibling-credit ordering.
- [ ] Playwright authenticated wedge: submit → approve → fare on sheet → export

## ~~P1 — Planner ignores direction on partial closures~~ FIXED 2026-08-18

Confirmed against the dev database: **406 of 444** two-direction routes (91.4%)
share no stop ids between directions, and zero share all of them. A closure
entered against outbound stops left the return journey planning straight through
the blocked road.

Fixed by resolving the closed window by position instead of by id
(`resolveClosedWindow` in `lib/closures.ts`, 150 m snap tolerance), the same
treatment the map got in T0. 8 tests. A stop-cluster concept would still be the
better long-term answer and would also fix search grouping and the T3b cascade.

## P2 — Deferred from partial-closures autoplan (2026-08-07)

- [ ] Road-segment cascade: one physical blockage → all routes serving that segment
- [ ] Multi-route “apply same closed stop range” helper (ops shortcut before full cascade)
- [ ] Playwright: console create SEVERED → map split → directions open-leg / spanning OD
      (all four verified manually against the dev DB on 2026-08-10; only the
      browser-level console form submit is still unexercised)
- [x] Short TTL cache for active closures on the directions hot path (10 s,
      dropped on every closure write). Only the live "now" read is cached — a
      dated query bypasses it and can't poison it.

## P1 — Batch D (route/stop editor), in progress 2026-08-10

- [x] Foundation: StopOverride/RouteOverride + migration, RBAC `feedEdit`,
      seed apply-overrides, export regen for stops.txt/routes.txt
- [ ] Apply/Publish pipeline: regenerate zip → reseed DB → rebuild OTP graph,
      explicit batched Publish button + "live as of version N" badge (admin+)

Route tabs + full CRUD (locked 2026-08-12, docs/route-editor-design.md part 2).
Tabs: Details | Stops | Trips | Service. Costs/Coverage dropped, Shapes deferred.
- [x] T0: provenance (Route/Stop.origin, tombstones, Trip.directionId) + the three
      foundation corrections — scoped deleteMany, tombstone-aware apply, CSV
      rewriters that append operator rows. MUST land before T1.
- [x] T1: tab shell + Details (5a) + create/duplicate/delete route
- [x] T2: Stops tab — ordered list, rename (5c-rename), create/delete stop
- [x] T3: Trips tab (editable block_id via TripOverride) + Service tab.
      network-map.tsx is 1171 -> 731 lines and complexity 51 -> 17. Both it and
      route-service-tab sit at 17 against the limit of 15 — worth a second pass.
- [x] Route "+ Add route" entry point — already existed at /console/routes, and
      it was **silently dropping routes from the published feed**: `origin`
      defaults to FEED and the exporter only collects created routes with
      `origin: OPERATOR`, so a route added in the console showed on the map and
      then vanished on publish. Fixed + regression test; one live route (A25)
      repaired in the dev DB.
- [x] **DRY: two createRoute actions.** Both now go through `createRouteRow` in
      `lib/route-create.ts`. The two entry points stay — their permissions and
      callers genuinely differ, and permissions.ts documents why — but id
      generation, agency lookup, `origin: OPERATOR` and assignment live in one
      place. Ids are `op:` from both doors now (`manual-` was only ever mentioned
      in a comment, never branched on).
- [ ] T3b: cascade switch — affected-route count (distinct, max 26 at Torhayloch)
      + grouped closures sharing a cascadeId, reopened together
- [x] T4: stop reordering (5b). `reorderRouteStops` + `RouteStopOrderOverride` +
      drag-to-reorder in the Stops tab + seed replay + stop_times.txt regen in
      the export. The /ship plan audit (2026-08-17) caught the export half
      missing — a reordered list showed in the console and survived a reseed
      while the published zip kept the feed's original order.
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
- [x] S3: apply-overrides replays ShapeOverride (a reseed no longer silently
      replaces every drawn line with DT4A's original) and the export regenerates
      shapes.txt. Stored geojson is written back verbatim rather than re-snapped,
      so an OTP graph rebuild can't quietly redraw geometry a human approved.
- [x] Restore corrupted punctuation in network-map.tsx

Deferred from the S2 QA pass (2026-08-17):
- [x] P2 — Component test infrastructure (@testing-library/react + jsdom).
      Per-file opt-in via `// @vitest-environment jsdom`, so the suite stays on
      node. First test covers the "detail fetch failed → blank panel" bug;
      verified it fails when the fix is reverted.

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
