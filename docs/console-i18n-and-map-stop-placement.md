# Plan: Console Amharic + click-to-place a stop

Branch: `feature/invite-flow-amharic-stops` → `dev`
Status: under /autoplan review

## Problem

Two operator-facing gaps, both surfaced after the invitation workflow landed.

**C1 — The console is English-only.** The rider app is fully localized (106 keys
across `messages/en.json` and `am.json`, cookie locale `dandii_locale`,
`LocaleToggle` in the header). The operations console is not: **0 of 48**
`.tsx` files under `app/console`, `app/settings` and `components/console` call
`useTranslations`, against roughly **148 distinct user-visible strings** and
7,472 lines.

**C2 — Adding a stop means typing coordinates.** `route-stops-tab.tsx` has a
create form with `newLat` / `newLon` text inputs. An operator who knows exactly
where the stop is on the map has to read coordinates off something else and
type them in. Clicking the map should place it.

## Prior decisions this touches

`docs/rewards-and-amharic-design.md` §4 locked two things that this plan
changes or is gated by:

1. **"Console (operator-facing) stays English for v1 — small internal group."**
   C1 reverses this deliberately. The premise was that the console had a small
   English-reading internal audience. The invitation workflow (shipped this
   branch, commit `21ee87c`) invalidates it: the console is now provisioned for
   per-operator dispatchers at Anbessa, Sheger, Alliance, Minibus and LRT.

2. **"A native Amharic speaker must review every string — this is the real gate
   on the feature, not the code."** Still true, and it applies to all ~148
   console strings. Code can produce the pipeline and an untranslated-but-wired
   catalogue; it cannot produce trustworthy operational Amharic.

Note also that the shipped implementation diverged from the doc: the doc
specified `localePrefix: "as-needed"` with `/am/...` URLs, but locale is
cookie-only (`/am` returns 404). Not a defect, but the doc is stale.

## Scope

### C1 — Console i18n
- Add console/settings namespaces to `messages/en.json` and `messages/am.json`.
- Replace literal strings in console/settings with `useTranslations` /
  `getTranslations` calls.
- Ensure the `LocaleToggle` is reachable from the console shell.
- Keep operator-entered data (route names, stop names, headsigns) untouched —
  that is feed data, already handled by `nameAm` and `translations.txt`.

### C2 — Click-to-place a stop
- A "place on map" affordance in the Stops tab create form.
- While placing, a click on the console map fills `newLat` / `newLon` and shows
  a provisional marker.
- Escape / a cancel control exits placing mode without creating anything.
- Reuses the existing `createStop` action unchanged.

## Not in scope
- Translating GTFS feed data (already shipped: `Stop.nameAm`, `translations.txt`).
- Machine-translating the 148 console strings and presenting them as final.
- Locale-prefixed URLs (`/am/console/...`).
- Changing where a clicked stop lands in the sequence — it appends, as today.

## What already exists
| Need | Existing code |
|---|---|
| i18n runtime | `src/i18n/request.ts`, `config.ts`, `LOCALE_COOKIE` |
| Locale toggle | `components/foundations/locale-toggle.tsx` |
| Ge'ez font | `app/layout.tsx` (Noto Sans Ethiopic already loaded) |
| Map click with modes | `network-map.tsx:358` `onMapClick`, branches on `drawing` |
| Provisional map markers | `shape-draw-layer/` |
| Create a stop | `actions/stop-edit.ts` `createStop` (lat/lon/name/routeId/sequence) |
| Create form + lat/lon state | `route-stops-tab.tsx` `newLat` / `newLon` |
