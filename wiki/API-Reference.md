# API Reference

Dandii exposes a small set of HTTP route handlers for **reads** (map data, search, journey planning, exports) and does all **writes** through Next.js **server actions** (never public mutation endpoints). Handlers live in `web/src/app/api/`; actions in `web/src/actions/`.

## HTTP endpoints

### Geometry (map data)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/geo/routes` | public | GeoJSON `FeatureCollection` of simplified route shapes with `{ routeId, shortName, operatorCode, closed }`. Cached `s-maxage=3600`. |
| GET | `/api/geo/stops` | public | All stops as GeoJSON points. |
| GET | `/api/geo/hub-stops` | public | Major/hub stops for the idle map view. |

### Search and route detail

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/search?q=<text>` | public | `{ routes: [...], stops: [...] }` matching the query (min 2 chars). |
| GET | `/api/routes/[routeId]` | public | Full route detail: shape, ordered stops, frequencies, live fare, active closure. |
| GET | `/api/routes/[routeId]/hover` | public | Lightweight hover preview (stop list + full geometry). |

### Journey planning

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/api/otp` | public | Proxies a GraphQL query to OpenTripPlanner (`OTP_URL`). Exists to avoid browser CORS. Body: `{ query, variables }`. |

### Exports (console roles)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/export/routes.csv` | console | Routes with operator + geometry length. |
| GET | `/api/export/fares.csv` | console | Normalized fare table (one row per tier; flat = one "Flat" row). |
| GET | `/api/export/closures.csv` | console | Closure history. |
| GET | `/api/feeds/[version]/download` | console | Streams a generated GTFS zip. `200` / `404` unknown / `410` pruned. |

Export access is gated by `requireExportAccess()` (401 if signed out, 403 if not a console role).

### Auth

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/auth/[...all]` | better-auth handler (Google OAuth, sessions, admin plugin). |

## Server actions (writes)

All mutations are server actions. Each re-checks permissions with `requirePermission(...)` before touching the DB and returns a discriminated result (`{ ok: true, ... } | { ok: false, error }`).

| File | Actions | Guarding permission |
|---|---|---|
| `actions/fares.ts` | `updateFare`, `bulkSetFare` | `fare:update` |
| `actions/fare-proposals.ts` | `submitProposal` (signed-in rider), `reviewProposal` (approve/reject) | signed-in / `proposal:review` |
| `actions/closures.ts` | create/end closures | `closure:*` (maintainer limited to MAINTENANCE/OTHER) |
| `actions/assignments.ts` | assign route → operator | `route:assign` |
| `actions/routes.ts` | route create/update/delete | `route:*` |
| `actions/saved-routes.ts` | `toggleSavedRoute`, `markSubmissionsViewed`, `updateProfile` | signed-in |
| `actions/feed.ts` | `generateFeed` | `feed:generate` |

Input validation uses zod schemas (`*-schema.ts`), applied in both the action and — for fares — again before any value reaches the DB or exported feed.

The single fare write path (`applyFareChange()` in `lib/fare-write.ts`) is shared by `updateFare`, `reviewProposal`, and the reseed, so the `FareChangeLog` audit is always written. See [Crowdsourced Fares](Crowdsourced-Fares).

## Related

- [Public Map](Public-Map) · [Operations Console](Operations-Console) · [Roles and Permissions](Roles-and-Permissions)
