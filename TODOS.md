# TODOS

## P1 — Deferred from fare-registry plan (ship 2026-07-23)

- [ ] Console fare-history UI (FareChangeLog exists; no console surface yet)
- [ ] Unit/integration tests for fare-proposal action guards (dedup, rate limit, double-decision)
- [ ] Playwright authenticated wedge: submit → approve → fare on sheet → export

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
- [ ] T1: tab shell + Details (5a) + create/duplicate/delete route
- [ ] T2: Stops tab — ordered list, rename (5c-rename), create/delete stop
- [ ] T3: Trips tab (+ editable block_id) + Service tab (closure form moves here)
- [ ] T3b: cascade switch — affected-route count (distinct, max 26 at Torhayloch)
      + grouped closures sharing a cascadeId, reopened together
- [ ] T4: stop reordering (5b — TripStopOverride + stop_times regen)
- [ ] T5: Shapes tab — Edit/Trim/Snap (5c-shape)
- [x] Restore corrupted punctuation in network-map.tsx

Shape collapse folded into T0: store both directions in a `Shape` model; public
map shows inbound only, console shows both (amended 2026-08-12).

Coding-standards debt from the 2026-08-12 CLAUDE.md rules (14 files ours, 24
vendored Untitled UI files exempt):
- [ ] One component per file: 14 of our .tsx files declare 2+ components
      (public-map, network-map, directions-panel, library-rail, charts, …)
- [ ] `src/types/` does not exist yet; 51 files declare exported interfaces
- [ ] 142 useState call sites vs 2 zustand stores
