# QA Report — Dandii console, 5c-shape S2

**Date:** 2026-08-17
**Target:** http://localhost:3000/console/network
**Branch:** feat/partial-closures
**Auth:** `scripts/dev-login.ts super-admin` → signed cookie
**Tier:** Standard
**Trigger:** "You actually broke all the tabs except for service tab."

---

## Summary

| | |
|---|---|
| Reported symptom | All editor tabs blank except Service |
| Root cause of the report | **Environmental** — stale Prisma client in a long-running dev server |
| Real bugs found | 2 (1 high, 1 medium) |
| Fixed | 2 (both verified in the browser) |
| Deferred | 1 (component-test infrastructure) |
| Tests | 217 → 219 passing (+2 regression) |

**PR line:** QA reproduced the blank-tab report, traced it to a stale dev-server Prisma client, and found 2 genuine bugs behind it; both fixed and verified.

---

## The reported symptom

`GET /api/console/routes/{id}` returned **500**, so `detail` stayed null and every
tab that reads it rendered nothing. Service was unaffected because it reads the
route row, not the editor payload — which is exactly the reported pattern.

The 500 was **not a code defect**. The dev server (PID 71725) had been running
since before `baseGeojson` was added to the schema and `prisma generate` was run,
so its in-memory Prisma client didn't know the column. The same query succeeded in
a standalone script against the same database. After restarting the dev server the
endpoint returned 200 with `shapeOverride` populated on each direction.

**Takeaway:** restart the dev server after any `prisma generate`. Logged as a
learning.

---

## ISSUE-001 — Right-click menu never opened on an unselected route

**Severity:** High · **Category:** Functional · **Status:** fixed, verified

Right-clicking a route line selects that route and opens the shape menu. Selecting
a route changes `selectedRouteId`, which fires the "abandon any drawing" effect,
and that effect called `reset()` — which also cleared `contextMenu`. The menu was
wiped in the same tick it appeared.

It only worked on a route that was *already* selected, because only then did
`selectedRouteId` not change. In practice that meant the right-click entry point
was dead for almost every route.

**Repro:** right-click any route line that isn't the currently selected one → the
route selects, no menu appears.

**Fix:** split the store reset in two. `resetDraft()` drops the drawing and leaves
the menu alone (used on route change); `reset()` drops both (used on cancel, save,
and leaving the editor).
`web/src/stores/shape-draw-store.ts`, `web/src/components/console/network-map.tsx`

**Verified:** right-click on an unselected route now opens
`Shape actions for Outbound → Mexico` with "Edit shape" enabled, "Reset to feed
shape" disabled and explained, and focus on the first item. "Edit shape" closes
the menu, switches to the Shapes tab, and enters draw mode for the clicked
direction.

**Regression test:** `shape-draw-store.test.ts` — "leaves an open context menu
alone" / "still drops the drawing".

---

## ISSUE-002 — A failed detail fetch rendered a blank panel

**Severity:** Medium · **Category:** UX / silent failure · **Status:** fixed, verified

When `/api/console/routes/{id}` failed, `detail` was null and the tab body
returned `null`. Four of the five tabs went completely blank — no message, no
retry, no indication anything had gone wrong. This is what made a single failing
request look like "the editor is broken", and it is the same silent-failure class
the S2 review was built around.

**Repro:** make the detail endpoint fail (stop the DB, or run against a stale
Prisma client) → select a route → Details/Stops/Trips/Shapes are empty.

**Fix:** the tab body now shows "Couldn't load this route's details." with a Retry
button wired to the existing reload path.
`web/src/components/console/route-tab-body/route-tab-body.tsx`

---

## Verified working

Signed in as super-admin against the live DB and OTP graph:

| Flow | Result |
|---|---|
| Details tab | renders, all fields populated |
| Stops tab | 9 stops in order, direction switcher, drag handles |
| Trips tab | 2 trips with times and block column |
| Shapes tab | both directions, point counts, Draw buttons |
| Service tab | renders |
| Shapes → Draw | enters draw mode, banner names the direction |
| Click map ×3 | 3 waypoints placed; **route stays selected** (the P1 regression fix) |
| Snapping | **2 requests for 3 waypoints** — one per new segment, not the whole draft |
| Snap response | 152 road-following points, `straightLine: false`, `unsnappedCount: 0` |
| Save | "Shape saved"; panel shows `240 points · 3 waypoints · by Dev super-admin` + Edited badge |
| Provenance | "Live on the rider map · not yet in the exported feed" |
| Reset to feed shape | restores 174 points, clears the badge, drops the override |
| Right-click → menu | correct direction, correct disabled state, keyboard focus |
| Right-click → Edit shape | closes menu, activates Shapes tab, enters draw mode |
| Cmd+Z | pops the last waypoint (3 → 1 over two presses) |
| Escape | "Discard this drawing?" then exits cleanly |
| DB after testing | 0 overrides, A24 restored to 174 feed points |

---

## Deferred

- **Component test infrastructure.** ISSUE-002 is a render-branch bug and deserves
  a component test, but the project has no `@testing-library`/jsdom setup and
  installing one mid-QA is its own decision. → TODOS.

## Notes not worth a bug

- The map basemap (`tiles.openfreemap.org`) intermittently fails to load in the
  in-app browser pane (glyph 404s, `isStyleLoaded()` false). External CDN, not app
  code; the map rendered correctly on the runs where tiles loaded.
- MapLibre only emits `contextmenu` after a full mousedown → contextmenu → mouseup
  sequence. A bare synthetic `contextmenu` is silently swallowed — this cost real
  debugging time and briefly looked like an app bug.
