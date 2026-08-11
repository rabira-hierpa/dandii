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
- [ ] T3: Trips tab (read-only) + Service tab (closure form moves here)
- [ ] T4: stop reordering (5b — TripStopOverride + stop_times regen)
- [ ] Shape collapse: seed keeps only the first shape_id and 444/447 routes have
      two — rider map discards a direction. Prerequisite for the Shapes tab.
- [ ] Restore corrupted punctuation in network-map.tsx (U+FFFD at lines 140/424/425,
      "Couldn -t" / "Closing -" — HEAD is clean)
