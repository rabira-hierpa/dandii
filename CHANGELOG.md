# Changelog

All notable changes to Dandii are documented in this file.

## [1.1.0] — 2026-07-29

### Added

- **Hybrid journey planner.** Direct single-seat rides are matched from our own GTFS data (cluster origin/destination stops, find routes serving both on one trip), ranked operator-first (minibus → sheger → anbessa → alliance → LRT). Multi-leg trips fall back to OTP. Fixes directions that ignored direct minibuses and defaulted to Anbessa/LRT.
- **Per-operator OTP agencies + Addis OSM street layer.** The feed now tags each route's `agency_id` with its operator so OTP can rank/ban by agency; the graph gains an Addis street extract (`otp-data/addis.osm.pbf`), giving coordinate planning, real walk-leg geometry, and street-network transfers.
- **Road-snapped direction lines.** Legs whose feed shape doesn't cover their stops are routed over OTP's street graph instead of drawn as straight lines cutting across blocks.
- **Stop-by-stop results.** Each direction result expands to the full board → alight stop list.
- **Agency filter for directions** and **grouped stop search** (same-named stops like the ~36 "Megenagna" nodes collapse to one result with a count).
- **Console network map hover** matching the public map (route highlight, stop preview, name tooltip).
- Locked design doc for the console route/stop editor (`docs/route-editor-design.md`).

### Tests

- Unit coverage for the new logic: direct-route helpers (haversine, GTFS time parsing, fare tiers, leg geometry fallback), OTP fallback (operator mapping, per-leg fares, journey dedup/ranking), and stop-name grouping.

## [1.0.0] — 2026-07-23

First public release of **Dandii** — Addis Ababa transit map and operations console.

### Added

- Public Google Maps–style transit map: search, route/stop detail, journey planning (OTP), library rail (saved / recent / submissions), State B/C layouts
- Crowdsourced fare registry: rider proposals, maintainer review queue, `applyFareChange` audit trail, preserve-fares seed
- Versioned GTFS fares-overlay export with MobilityData validator CI gate
- Operations console: routes, fares, closures, analytics, feeds
- Dandii brand (minibus mark, Poppins), SEO (sitemap, robots, OG, JSON-LD, llms.txt)
- Public-repo docs: PolyForm Noncommercial license, SECURITY, CONTRIBUTING

### License

PolyForm Noncommercial 1.0.0 — attribution required; no commercial use without a separate license.
