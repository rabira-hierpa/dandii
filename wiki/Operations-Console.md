# Operations Console

The console at **`/console`** is the staff surface. It's reachable by the four console roles (see [Roles and Permissions](Roles-and-Permissions)); the exact controls you see depend on your role. This page is a how-to for each section.

## Navigation

| Section | Route | Purpose |
|---|---|---|
| Agency Overview | `/console` | Operator stat cards and network health. |
| Route Assignment | `/console/routes` | Map route ids to operators. |
| Network Map | `/console/network` | Open/close routes with a reason and date range. |
| Fare Management | `/console/fares` | Set flat or tiered ETB fares per route. |
| Fare Review | `/console/proposals` | Approve/reject rider fare corrections. |
| Feed Versions | `/console/feeds` | Generate and download versioned GTFS exports. |
| Analytics | `/console/analytics` | KPIs and charts; CSV/printable exports. |
| Settings | `/settings` | Members, roles, system info (admins only). |

---

## How to assign a route to an operator

1. Go to **Route Assignment** (`/console/routes`).
2. Filter/search for the route by short name, long name, or operator.
3. Set the operator on the row and save. This writes a `RouteAssignment` (one operator per route) and immediately recolors the route on the public map.

Requires `route:assign` (route-operator and above).

## How to close (or reopen) a route

1. Go to **Network Map** (`/console/network`).
2. Click the route, choose a **reason** (`PUBLIC_HOLIDAY`, `MAINTENANCE`, `POLITICAL_EVENT`, `OTHER`) and a **date range**.
3. Save. While an active closure overlaps "now", the route renders dashed and shows a "Closed" banner everywhere (public map included). A route's status is derived from active closures, not a stored flag.

Requires `closure:create`. Maintainers can create closures too.

## How to set a fare directly

1. Go to **Fare Management** (`/console/fares`).
2. Pick a route. Choose **flat** (one ETB amount) or **tiered** (distance-band amounts via a field array).
3. Save. This writes through `applyFareChange()` with `source = CONSOLE_EDIT`, updating the live fare and appending an audit row.

Requires `fare:update` (route-operator and above). **Maintainers cannot edit fares here** — they use Fare Review instead.

## How to review rider fare corrections

1. Go to **Fare Review** (`/console/proposals`). Pending edits are **grouped by route**.
2. Each proposal shows a **three-way diff**: the fare the rider saw (baseline) → their proposal → the live fare now, plus a drift warning if the live fare changed since they submitted.
3. When multiple riders suggest the same value, an **"N riders agree"** pill appears — corroboration.
4. **Approve** to apply the fare (and mark sibling pendings on that route `SUPERSEDED`), or **Reject** with an optional reason shown to the rider.

Requires `proposal:review` (all four console roles). See [Crowdsourced Fares](Crowdsourced-Fares).

## How to publish a GTFS version

1. Go to **Feed Versions** (`/console/feeds`).
2. Click **Generate version**. Dandii overlays the current flat fares onto the base feed and writes a versioned zip (a `FeedVersion` row, `validatorStatus: PENDING`).
3. **Download** the zip and validate it out-of-band (the automated gate runs in CI).

Requires `feed:generate`. Full detail in [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions).

## How to read analytics and export CSVs

- **Analytics** (`/console/analytics`) shows KPIs and Recharts breakdowns by operator/mode, plus a printable report.
- CSV exports are available for routes, fares, and closures via `/api/export/*.csv` (buttons in the console). Any console role can export. See [API Reference](API-Reference).

## How to manage members and roles

1. Admins open **Settings → Members** (`/settings`).
2. Change a user's role within your assignment power (see `ASSIGNABLE_ROLES` in [Roles and Permissions](Roles-and-Permissions)). New permissions apply on their next request.

Requires `system:settings` + user-management permission (admin and above).

## Related

- [Roles and Permissions](Roles-and-Permissions) · [Crowdsourced Fares](Crowdsourced-Fares) · [GTFS Export and Feed Versions](GTFS-Export-and-Feed-Versions)
