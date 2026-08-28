/**
 * Partial (segment) route closures — see docs/partial-closures-design.md.
 *
 * A closure stores the CLOSED stop range rather than the open one. Each route
 * has two trips with opposite stop order, so a closed range resolves correctly
 * against both, whereas "open up to X" would need a direction to mean anything.
 *
 * SEVERED and SKIPPED carry identical data and differ only in whether a vehicle
 * can pass through the closed stretch:
 *   SEVERED — road blocked, nothing crosses; the route is cut in two.
 *   SKIPPED — vehicle detours; through-travel is fine, the stops aren't served.
 */
export type ClosureKind = "WHOLE_ROUTE" | "SEVERED" | "SKIPPED";

export interface ClosureRange {
  kind: ClosureKind;
  fromStopId: string | null;
  toStopId: string | null;
}

/** Inclusive stop-sequence window that a closure covers on one trip. */
export interface ClosedWindow {
  start: number;
  end: number;
}

/**
 * Map a closure's stop ids onto one trip's sequence numbers.
 *
 * Returns null when the closure doesn't constrain this trip — either it's a
 * whole-route closure (handled separately) or the trip doesn't serve both
 * boundary stops. Normalizes order, so the same range works for the trip that
 * runs the other way.
 */
export function closedWindow(
  closure: ClosureRange,
  stopSeqById: Map<string, number>,
): ClosedWindow | null {
  if (closure.kind === "WHOLE_ROUTE") return null;
  if (!closure.fromStopId || !closure.toStopId) return null;

  const a = stopSeqById.get(closure.fromStopId);
  const b = stopSeqById.get(closure.toStopId);
  if (a === undefined || b === undefined) return null;

  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** One call on a trip, with the geometry needed to resolve a closure onto it. */
export interface TripStop {
  id: string;
  sequence: number;
  lat: number;
  lon: number;
}

/**
 * How far a closure boundary may be snapped onto a stop the trip actually
 * serves.
 *
 * The two directions of a road are separate stops a carriageway apart, usually
 * 10-40 m, occasionally more at a wide interchange. 150 m covers that without
 * reaching the next stop along, which in Addis is rarely closer than 300 m.
 *
 * The two ways to be wrong are not equal. Too small and a closed road plans as
 * open, which is what this constant exists to stop. Too large and a usable
 * route is withheld — annoying, but it does not send anyone down a blocked
 * street.
 */
export const CLOSURE_SNAP_TOLERANCE_M = 150;

/**
 * The closed window on ONE trip, resolving across directions.
 *
 * A closure stores two stop ids, and the obvious reading is that they resolve
 * on any trip serving the route. They do not: 406 of the 444 two-direction
 * routes in the feed share no stop ids at all between their directions, because
 * each side of the road is its own stop with its own id. Matching by id alone
 * therefore resolves on the direction the operator happened to click and
 * silently returns "not closed" for the other one — so a road closed for a
 * political event stayed open in the return journey plan.
 *
 * Exact ids win when the trip serves them. Otherwise each boundary is snapped
 * to the nearest stop the trip does serve, which is the same treatment the map
 * got: a closure is a place on the ground, not a pair of database rows.
 */
export function resolveClosedWindow(
  closure: ClosureRange,
  stops: TripStop[],
  toleranceM: number = CLOSURE_SNAP_TOLERANCE_M,
  /**
   * Coordinates for boundary stops this trip does not serve. Passed in rather
   * than held at module scope: the server handles concurrent journey requests,
   * and shared mutable state would let one rider's closure resolve against
   * another's anchors.
   */
  anchors?: ReadonlyMap<string, { lat: number; lon: number }>,
): ClosedWindow | null {
  if (closure.kind === "WHOLE_ROUTE") return null;
  if (!closure.fromStopId || !closure.toStopId) return null;
  if (stops.length === 0) return null;

  const a = resolveBoundary(closure.fromStopId, stops, toleranceM, anchors);
  const b = resolveBoundary(closure.toStopId, stops, toleranceM, anchors);
  if (a === null || b === null) return null;

  // The return direction runs the stops the other way, so from/to arrive
  // reversed. Order them or every seq comparison downstream inverts.
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Sequence of `stopId` on this trip — by id, else by nearest position. */
function resolveBoundary(
  stopId: string,
  stops: TripStop[],
  toleranceM: number,
  anchors?: ReadonlyMap<string, { lat: number; lon: number }>,
): number | null {
  const exact = stops.find((s) => s.id === stopId);
  if (exact) return exact.sequence;

  const anchor = anchors?.get(stopId);
  if (!anchor) return null;

  let best: TripStop | null = null;
  let bestM = Infinity;
  for (const s of stops) {
    const d = haversineMeters(anchor.lat, anchor.lon, s.lat, s.lon);
    if (d < bestM) {
      bestM = d;
      best = s;
    }
  }
  return best && bestM <= toleranceM ? best.sequence : null;
}

/**
 * Whether a rider could still board at `boardSeq` and alight at `alightSeq`
 * given one closure. `window` comes from closedWindow() for the same trip.
 */
export function isPairBlocked(
  closure: ClosureRange,
  window: ClosedWindow | null,
  boardSeq: number,
  alightSeq: number,
): boolean {
  // The whole line is out — nothing on it is rideable.
  if (closure.kind === "WHOLE_ROUTE") return true;
  // Range doesn't apply to this trip (e.g. a one-direction-only stop pair).
  if (!window) return false;

  const inside = (seq: number) => seq >= window.start && seq <= window.end;

  // Either endpoint sits at a stop that isn't being served.
  if (inside(boardSeq) || inside(alightSeq)) return true;

  // SEVERED also blocks travel that would have to cross the closed stretch.
  // Board/alight are already ordered by the matching query, so a crossing is
  // simply "starts before the window and ends after it".
  if (closure.kind === "SEVERED") {
    const lo = Math.min(boardSeq, alightSeq);
    const hi = Math.max(boardSeq, alightSeq);
    return lo < window.start && hi > window.end;
  }

  // SKIPPED: the vehicle detours around it, so through-travel still works.
  return false;
}

/**
 * Whether ANY active closure blocks this (board, alight) pair on this trip.
 * Convenience wrapper for the planner, which checks a list per route.
 */
export function isPairClosed(
  closures: ClosureRange[],
  stopSeqById: Map<string, number>,
  boardSeq: number,
  alightSeq: number,
): boolean {
  return closures.some((c) =>
    isPairBlocked(c, closedWindow(c, stopSeqById), boardSeq, alightSeq),
  );
}

/**
 * Stop ids covered by a closure on one trip (trip order). Whole-route → every
 * stop; partial → the inclusive closed window; unresolvable range → empty.
 */
export function closedStopIds(
  closure: ClosureRange,
  stops: { id: string }[],
): Set<string> {
  if (closure.kind === "WHOLE_ROUTE") {
    return new Set(stops.map((s) => s.id));
  }
  const seqById = new Map(stops.map((s, i) => [s.id, i]));
  const window = closedWindow(closure, seqById);
  if (!window) return new Set();
  return new Set(
    stops.slice(window.start, window.end + 1).map((s) => s.id),
  );
}

/**
 * Human sentence describing what a closure leaves usable, for the console
 * preview and the rider-facing banner. `stopNames` is in trip order.
 */
export function describeClosure(
  closure: ClosureRange,
  stopNames: { id: string; name: string }[],
): string {
  if (closure.kind === "WHOLE_ROUTE") return "The whole route is out of service.";

  const seqById = new Map(stopNames.map((s, i) => [s.id, i]));
  const window = closedWindow(closure, seqById);
  if (!window) return "The whole route is out of service.";

  const closedNames = stopNames
    .slice(window.start, window.end + 1)
    .map((s) => s.name);
  const before = stopNames.slice(0, window.start);
  const after = stopNames.slice(window.end + 1);

  const closedList = formatList(closedNames);
  if (closure.kind === "SKIPPED") {
    return `Buses still run the full route but skip ${closedList}.`;
  }

  // SEVERED — name every still-usable island (tail / head / mid cut).
  const leg = (stops: { name: string }[]) =>
    stops.length === 0
      ? null
      : stops.length === 1
        ? stops[0].name
        : `${stops[0].name} → ${stops[stops.length - 1].name}`;

  const beforeLeg = leg(before);
  const afterLeg = leg(after);
  if (beforeLeg && afterLeg) {
    return `Route is cut in two: ${beforeLeg} and ${afterLeg}. ${closedList} unavailable.`;
  }
  if (beforeLeg) {
    return `Riders can still travel ${beforeLeg}. ${closedList} unavailable.`;
  }
  if (afterLeg) {
    return `Riders can still travel ${afterLeg}. ${closedList} unavailable.`;
  }
  return `${closedList} unavailable.`;
}

/** OTP `banned.routes` feed-scoped ids. Agency bans already use `1:CODE`. */
export function otpBannedRouteGtfsIds(routeIds: string[]): string {
  return routeIds.map((id) => `1:${id}`).join(",");
}

/**
 * Whether an OTP itinerary boards or alights at a skipped stop (by name).
 * OTP legs don't carry our stop ids, so name match is the practical filter.
 */
export function itineraryTouchesSkippedStops(
  legs: { mode: string; from: { name: string | null }; to: { name: string | null } }[],
  skippedStopNames: Set<string>,
): boolean {
  if (skippedStopNames.size === 0) return false;
  const norm = (n: string | null) => (n ?? "").trim().toLowerCase();
  for (const leg of legs) {
    if (leg.mode === "WALK") continue;
    if (skippedStopNames.has(norm(leg.from.name))) return true;
    if (skippedStopNames.has(norm(leg.to.name))) return true;
  }
  return false;
}

/**
 * Nearest vertex index on a LineString to a lat/lon, or null if farther than
 * `toleranceM` (same snap idea as directions.legGeometry).
 */
export function nearestVertexIndex(
  coords: number[][],
  lat: number,
  lon: number,
  toleranceM: number,
): number | null {
  if (coords.length < 2) return null;
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = (coords[i][0] - lon) ** 2 + (coords[i][1] - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  const [vx, vy] = coords[bestIdx];
  const gapM = haversineMeters(lat, lon, vy, vx);
  return gapM <= toleranceM ? bestIdx : null;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SHAPE_SNAP_M = 250;

/**
 * Split a route LineString into open vs closed coordinate runs for a closed
 * stop window. Returns null when the shape can't be trusted (caller should
 * fall back to painting the whole route closed).
 */
export function splitShapeByClosureWindow(
  coords: number[][],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): { open: number[][][]; closed: number[][] } | null {
  const i = nearestVertexIndex(coords, from.lat, from.lon, SHAPE_SNAP_M);
  const j = nearestVertexIndex(coords, to.lat, to.lon, SHAPE_SNAP_M);
  if (i === null || j === null || i === j) return null;

  const start = Math.min(i, j);
  const end = Math.max(i, j);
  const closed = coords.slice(start, end + 1);
  const open: GeoJSON.Position[][] = [];
  if (start > 0) open.push(coords.slice(0, start + 1));
  if (end < coords.length - 1) open.push(coords.slice(end));
  if (closed.length < 2) return null;
  return { open: open.filter((r) => r.length >= 2), closed };
}

function formatList(names: string[]): string {
  if (names.length === 0) return "no stops";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
