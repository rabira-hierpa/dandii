# TODOS

## P1 — Deferred from fare-registry plan (ship 2026-07-23)

- [ ] Console fare-history UI (FareChangeLog exists; no console surface yet)
- [ ] Unit/integration tests for fare-proposal action guards (dedup, rate limit, double-decision)
- [ ] Playwright authenticated wedge: submit → approve → fare on sheet → export

## P2 — Deferred from partial-closures autoplan (2026-08-07)

- [ ] Road-segment cascade: one physical blockage → all routes serving that segment
- [ ] Multi-route “apply same closed stop range” helper (ops shortcut before full cascade)
- [ ] Playwright: console create SEVERED → map split → directions open-leg / spanning OD
- [ ] Short TTL cache for active closures on the directions hot path
