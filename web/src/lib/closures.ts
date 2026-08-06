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
  const openNames = [
    ...stopNames.slice(0, window.start),
    ...stopNames.slice(window.end + 1),
  ].map((s) => s.name);

  const closedList = formatList(closedNames);
  if (closure.kind === "SKIPPED") {
    return `Buses still run the full route but skip ${closedList}.`;
  }
  // SEVERED: name the still-usable leg, which is what riders actually need.
  const firstOpen = openNames[0];
  const lastBeforeClosure = stopNames[window.start - 1]?.name;
  if (firstOpen && lastBeforeClosure) {
    return `Riders can still travel ${firstOpen} → ${lastBeforeClosure}. ${closedList} unavailable.`;
  }
  return `${closedList} unavailable.`;
}

function formatList(names: string[]): string {
  if (names.length === 0) return "no stops";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
