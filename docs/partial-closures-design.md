<!-- /autoplan restore point: /Users/rz/.gstack/projects/rabira-hierpa-menged/feat-partial-closures-autoplan-restore-20260807-000858.md -->
<!-- /autoplan working plan: /Users/rz/.gstack/projects/rabira-hierpa-menged/feat-partial-closures-plan-20260807.md -->

# Partial (segment) route closures — locked design

Status: **locked, ready to build.** Extends the existing whole-route closure so a
disruption can cover part of a route instead of all of it.

## 1. Problem

`RouteClosure` today carries only a `routeId`: a route is either fully open or
fully closed. Real disruptions usually aren't. A road blocked past **22 Mazoria**
takes out the tail of Tx YK 016 while the rest keeps running:

```
Megenagna → Lem Hotel → 22 Mazoria │ Stadium → Legehar → Mexico
        still rideable             │        out of service
```

Today the operator's only options are to close the whole route (wrong — riders
lose a working leg) or leave it open (wrong — riders get sent into a blockage).

## 2. The key distinction: can vehicles pass through?

Two disruptions look identical in the data (a stop range) but behave differently
for a rider, so the operator picks which one it is:

| Kind | Reality | Through-travel across the range | Stops in the range |
|---|---|---|---|
| **SEVERED** | Road blocked; nothing crosses | ❌ impossible — the route is cut in two | ❌ unusable |
| **SKIPPED** | Vehicle detours around it | ✅ still works | ❌ unusable |

The screenshot example is **SEVERED**: closed range = Stadium…Mexico, so
Megenagna→22 Mazoria works and Megenagna→Mexico does not.

`SKIPPED` matters for the common case where a few stops are unreachable (roadworks
on one block) but the line still runs end to end.

## 3. Model

Store the **closed** range, not the open one. A route has two trips with opposite
stop order; a closed range resolves correctly against both, whereas "open up to X"
would need a direction to be meaningful.

```prisma
enum ClosureKind {
  WHOLE_ROUTE // entire route out of service (today's behaviour — the default)
  SEVERED     // segment blocked: no travel across it
  SKIPPED     // segment detoured: through-travel fine, listed stops not served
}

model RouteClosure {
  // …existing: routeId, reason, note, startsAt, endsAt, createdById…
  kind       ClosureKind @default(WHOLE_ROUTE)
  /// First stop of the closed range (inclusive). Null for WHOLE_ROUTE.
  fromStopId String?
  /// Last stop of the closed range (inclusive). Null for WHOLE_ROUTE.
  toStopId   String?
}
```

Existing rows keep working untouched: `kind = WHOLE_ROUTE`, both stop ids null.

**Validation.** For SEVERED/SKIPPED both stop ids are required, must both be served
by the route, and are normalized so `from` precedes `to` in trip order.

## 4. Planner enforcement — the part that makes this real

Closures currently **do not affect directions at all**. `lib/directions.ts` tags a
result with `closed: true` and still returns it, so today even a fully closed route
is recommended. That is a bug in its own right; this work fixes it.

`findDirectRoutes` matches (board, alight) pairs on a trip. Against an active
closure, drop a pair when:

- **WHOLE_ROUTE** — the route is excluded entirely.
- **SKIPPED** — board or alight is inside the closed range.
- **SEVERED** — board or alight is inside the closed range, **or** the pair spans
  the range (`boardSeq < rangeStart && alightSeq > rangeEnd`, or the reverse for
  the opposite-direction trip).

The OTP transfer fallback can't see our closures, so severed/whole-route closures
also feed OTP's `banned.routes` for the affected route ids.

## 5. Map rendering

`/api/geo/routes` returns one feature per route with a `closed` flag; the map has
`routes-open` and `routes-closed` layers filtering on it.

For a partially closed route, emit **two features** for the same `routeId` — the
open portion (`closed: false`) and the closed portion (`closed: true`) — by slicing
the route shape at the range boundary. The existing layer filters then render the
split automatically, with **no client-side layer changes**.

## 6. Console UI

The closure form on the network map gains:
1. **Scope** — "Whole route" (default) or "Part of the route".
2. When partial: **two stop pickers** listing the route's stops in trip order, and
   a **kind** choice phrased for operators rather than in enum terms:
   - *"Road is blocked — buses can't get through"* → SEVERED
   - *"Buses detour around it — they just skip these stops"* → SKIPPED
3. A plain-language preview: *"Riders can still travel Megenagna → 22 Mazoria.
   Stadium, Legehar and Mexico are unavailable."*

The route detail sheet and closure banner show the same sentence to riders.

## 7. Out of scope (deliberate)

- **Road-level cascade.** A physically blocked road affects every route using it;
  today the operator marks each route separately. Cascading from a road segment to
  all routes serving it is a follow-up (agreed), layered on top of this rather than
  replacing it.
- GTFS export is unaffected — closures are operational state, not feed data.

## 8. Phasing

| Step | Scope |
|---|---|
| C1 | Schema + migration, validation, closure actions |
| C2 | Planner enforcement (`directions.ts` + OTP ban) — includes fixing whole-route |
| C3 | Map split rendering (two features per partially closed route) |
| C4 | Console form + rider-facing wording |
| Later | Road-segment cascade across routes |
