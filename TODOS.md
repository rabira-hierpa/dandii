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
- [ ] 5a: route field editor (shortName/longName/color/operator)
- [ ] 5c-rename: stop name editor — the "36 Megenagnas" fix
- [ ] 5b: stop-sequence editor (needs TripStopOverride + stop_times regen)
- [ ] 5c-shape: interactive shape editor (needs ShapeOverride + shapes regen)
