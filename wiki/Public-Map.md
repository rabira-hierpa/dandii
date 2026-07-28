# Public Map

The public map at **`/`** is the rider surface — a full-screen, Google-Maps-style WebGL map of the whole Addis network. It works fully signed-out; signing in adds saving and fare corrections. This page covers what riders can do.

## The map

- All 447 route shapes render from one MapLibre GL source, colored by operator, with closed routes dashed.
- A layers control toggles operators on/off; hover highlights a route and previews its stops.
- Basemap is OpenFreeMap (no API key).

## How to find a route or stop

1. Type in the search box (routes and stops search as you type, via `GET /api/search`).
2. Pick a result. The map flies to it and the **route detail** opens.

Route detail shows the shape, ordered **stops**, **headways** (frequency windows), the **live fare**, and a **closure banner** if the route is currently closed.

## How to plan a journey

1. Switch to the **Directions** tab.
2. Choose a start and destination (stop pickers, or "use my location" which snaps to the nearest stop).
3. Dandii calls OpenTripPlanner (via the `/api/otp` proxy) and draws itinerary options, with the active one highlighted and walk segments dotted.

OTP here is transit-only, so transfers fall back to straight-line walking between stops.

## How to share a route

Every route has a deep link: **`/?route=<routeId>`**. Opening that URL selects the route directly (used by the share action and by anyone you send the link to).

---

## Signed-in extras

Signing in (Google OAuth) gives every rider the default `user` role. No console access, but:

### Save routes
Save a route from its detail card. Saved routes appear in your library and open on the map in one click. Backed by the `SavedRoute` table.

### Submit a fare correction
On any route, suggest what the current fare really is:

1. Open the route and start a fare correction.
2. For a **flat** route, enter one amount; for a **tiered** route, enter each tier's amount (labels and km-bands are fixed — restructuring tiers stays console-only).
3. Submit. It's stored as a whole-fare replacement and enters the maintainer's **Fare Review** queue.

Guards you may hit: you can have only **one pending edit per route** at a time, and up to **5 submissions per day**. See [Crowdsourced Fares](Crowdsourced-Fares).

### Track your submissions
The account menu links to **Submitted fares** (`/profile`), showing each edit as **Pending / Approved / Rejected / Resolved**, with the maintainer's note on rejections. An unseen-count badge on your avatar flags edits decided since you last looked; it clears when you view them.

### Manage your profile
`/profile` lets you edit your display name and see your contribution stats (saved routes, fare edits, approved).

## Under the hood

| Data | Endpoint | Cache |
|---|---|---|
| All route geometry (simplified) | `GET /api/geo/routes` | `s-maxage=3600` |
| Hub stops | `GET /api/geo/hub-stops` | cached |
| Search | `GET /api/search?q=` | uncached |
| Route detail | `GET /api/routes/[id]` | uncached |
| Hover preview | `GET /api/routes/[id]/hover` | cached client-side |
| Journey plan | `POST /api/otp` | proxy to OTP |

See [API Reference](API-Reference).

## Related

- [Crowdsourced Fares](Crowdsourced-Fares) · [API Reference](API-Reference) · [Architecture](Architecture)
