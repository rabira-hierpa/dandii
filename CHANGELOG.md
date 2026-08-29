# Changelog

All notable changes to Dandii are documented in this file.

## [2.0.0] - 2026-08-29

Console invitations and per-operator authorization change who can do what
across the whole app — every operator-scoped role, every feed-edit mutation,
and the console's own read surfaces are gated on it now. That's the major
bump: an admin's and a route-operator's console are no longer the same shape.

### Added
- **Console invitations**, self-service by design. A super-admin or admin
  invites someone by email with a role (and, for `route-operator`, the
  operator they run); the invitee accepts by signing in with Google using
  that exact address — no separate password flow. Settings → Invitations
  lists pending/accepted/revoked/expired invites and lets you revoke one
  before it's used. Falls back to a copyable link when no email provider
  (`RESEND_API_KEY`) is configured.
- **Console invitations are scoped to an operator.** Inviting someone to run
  Anbessa's routes now grants exactly that: `lib/operator-scope.ts` checks
  every feed-edit mutation against the invitee's operator, refuses routes
  assigned elsewhere or to nobody, and keeps shared interchanges — a stop
  more than one operator calls at — with the admins.
- **Every console read surface scoped to the viewer's operator** — fares,
  closures, and proposal review now show a route-operator only what they run,
  not the whole network.
- **Amharic stop names**, end to end. `Stop.nameAm` / `StopOverride.nameAm`
  fields, a console editor field beside the existing rename, and the public
  map (search, stop markers, route sheet, directions) showing the Amharic
  name whenever the reader's locale is `am`, with an English fallback where
  nobody's translated a stop yet. Amharic for the console shell, nav, and
  page headers too. The exported feed carries a GTFS `translations.txt` built
  from the same names, keyed by `record_id` so two stops sharing a name stay
  distinct.
- **Click the console map to position a new stop** instead of typing
  coordinates by hand.
- **Fare history in the console:** who changed a route's fare, from what to
  what, and whether it came from a rider proposal or a console edit.

### Fixed
- Role changes in Settings no longer go through better-auth's `setRole`,
  which knew nothing about the operator column — demoting an admin to
  route-operator through it produced a route-operator with no operator,
  which is to say one with the run of the whole network.
- **The console Network Map explains an empty basemap instead of just
  showing one.** A database seeded before per-direction shapes existed drew
  nothing and gave no reason why, for every role including super-admin — an
  operator had no way to tell "you lack access" from "the feed has no
  geometry" apart.
- **`db:seed` actually runs inside the deployed Docker container.** Three
  separate bugs, each hiding the next: `tsx --env-file=.env` hard-crashed
  because the container has no `.env` file (env vars come from
  `docker-compose`, not a file); `GTFS_DIR`'s default assumed the local-dev
  cwd layout and resolved outside the container's bind-mounted `data/`
  entirely; and `prisma/seed/build-geojson.ts`'s `@turf/*` + `papaparse`
  imports were never traced into the standalone build (small pure-JS
  packages get inlined into the webpack server bundle rather than left as a
  `node_modules` entry, so the app itself worked while `tsx`'s real Node
  module resolution failed). Fixed all three; the reseed a database missing
  shapes needs is now just `docker exec <web> npm run db:seed`.

## [1.3.0] — 2026-08-17

### Added

- **Close part of a route, not all of it.** A road blocked between two stops used to mean closing the whole line, which told riders a dozen working stops were unavailable. Closures now carry a stop range and a kind: **severed** (the route is cut, each side still runs) or **skipped** (vehicles pass through without stopping). The map draws the closed stretch separately from the open ones, and the planner routes riders around the closed span instead of refusing the journey.
- **A route editor in the console.** Selecting a route opens tabs for **Details**, **Stops**, **Trips**, **Shapes**, and **Service**. Operators can correct a route's name, colour, type, operator, and flag-stop settings; rename stops (the feed ships 45 variants of "Megenagna"); create, delete, and drag-reorder stops; set GTFS `block_id` so a rider staying aboard between two runs isn't told to change vehicles; and create, duplicate, or delete whole routes.
- **Draw a route on the map, snapped to real roads.** Right-click a line or open the Shapes tab, then click to place waypoints — each segment snaps to the drivable road network as you go. Snapping asks the routing graph for a **car** path, not a walking one, so a minibus is never drawn through a footbridge or a pedestrian square. A stretch the road data can't route is drawn dashed and counted, rather than quietly replaced with a straight line. **Reset to feed shape** puts the original geometry back.
- **Operator edits reach the published feed.** The exported GTFS zip now rewrites `stops.txt`, `routes.txt`, `trips.txt`, and `stop_times.txt` from the base feed plus operator corrections — including rows for stops and routes created in the console, and omitting ones deleted there. Fields the DT4A feed has no column for (`route_url`, `continuous_pickup`, `block_id`) widen the header instead of vanishing on publish.

### Changed

- **Edits survive a reseed.** Every correction is stored as an override beside the feed row rather than written over it, so reloading the vendored feed replays the edit instead of losing it. Deleting a feed route or stop leaves a tombstone; entities created in the console are marked as operator-authored and kept.
- **The console map shows both directions.** Operators edit each direction separately, so outbound and inbound are now distinct lines. Selecting a route puts its stops on the map, and clicking a stop in the list flies to it.
- **Reordering keeps the timetable honest.** Times stay with the position, not the stop — a run reaches its fifth call at the same time whichever stop that is. Carrying each stop's old time along would emit a timetable that runs backwards mid-trip.

### Fixed

- **Partial closures now follow the real route line.** The closed stretch was sliced from the simplified geometry, which put the break in the wrong place on curved corridors.
- **The route form no longer shows the previous route's values.** Selecting a different route remounts the editor, so every field reflects the route actually open — not just the visible ones.
- **A colour change shows up immediately** on the map instead of waiting for the next publish.
- **Drag-to-reorder stops** works against trips rather than colliding on the `(trip, sequence)` key.

## [1.2.0] — 2026-08-05

### Added

- **Amharic (አማርኛ).** Full second locale via `next-intl`, with an EN/አማ toggle. The locale lives in a cookie (seeded from `Accept-Language`), so no route had to move; `/am/` URLs are a planned follow-up. Adds Noto Sans Ethiopic to the font stack — Inter and Poppins carry no Ge'ez glyphs, so Amharic would otherwise render as tofu. Level titles are translated too. Catalog parity (matching keys, preserved ICU placeholders) is enforced by tests.
- **Contributor rewards (R2).** Public **Fare Scouts leaderboard** at `/leaderboard`, ranked by points — **opt-in only**, so a rider is never listed publicly as a side effect of contributing (toggle on the profile). Adds **streaks** (consecutive weeks with an approved contribution, with a one-week grace so a single busy week doesn't erase months of habit) and two milestone badges: **Network Explorer** (approved fares across ≥3 operators, rewarding breadth over farming one corridor) and **Consistent Commuter** (a 4-week streak).
- **Contributor rewards (R1).** "Fare Scout" status ladder: an append-only points ledger, derived levels, and milestone badges. Submitting a fare correction earns a small nod (+2); an **approved** correction earns the real reward (+20) and can unlock a badge; a rejection claws the nod back so junk nets zero; a correct-but-superseded proposal gets partial credit (+10). Awards are idempotent per (proposal, reason) and run inside the existing review transaction. New "My Contributions" panel on the profile shows points, level, progress to the next level, badges, and impact. Includes a retro-backfill script so pre-R1 contributors aren't starting from zero.
- **Google Analytics 4.** Site-wide gtag via `@next/third-parties` (reads `G4A_TAG`), plus curated custom events for the essential actions — public: search (`search_term`), route/stop select, directions request, agency filter, transit-layer toggle, account menu, my-location, save route, fare-proposal submit; console: route select, close/reopen route, fare review. Events run through one helper (`lib/gtag.ts`).

### Changed

- **Profile and sign-in redesigned** on a shared `TransitBackdrop` (the green wash, route lines, and minibus watermark from the 404/access-denied pages), so every full-page surface outside the map reads as one product. 404 and access-denied are unchanged.
- **Submitted fares are explorable.** Selecting a fare edit on the profile reveals the route it belongs to, the fare change as a before → after diff, both notes, the submitted/decided dates, and a deep link to the route on the map. Routes with no prior fare read "No fare on record" rather than a misleading 0 ETB.
- **Enterprise coding standards enforced in tooling**, not just prose: ESLint now bans `../` parent imports, requires `import type`, bans `any`, and warns above cognitive complexity 15. Generated Prisma code is ignored; vendored Untitled UI is relaxed. Adds a **Security Standards** section to `web/CLAUDE.md` (secrets/config, authn/authz, input validation + parameterized DB, output/injection safety, errors/rate-limiting/deps).

### Fixed

- **`prisma migrate dev` no longer demands a destructive reset.** The dev database had a `stop_graph` migration applied that was missing from the repo and from `schema.prisma`. Adopted it — migration recreated from the live DDL and models declared — rather than dropping 2270 nodes / 3885 edges of computed data whose generating script isn't in the repo.

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
