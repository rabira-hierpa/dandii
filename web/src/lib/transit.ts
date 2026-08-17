import { prisma } from "@/lib/prisma";
import type { ClosureKind } from "@/lib/closures";

/** A route is closed iff an active closure overlaps `now`. */
export function activeClosureFilter(now = new Date()) {
  return { startsAt: { lte: now }, endsAt: { gte: now } };
}

/**
 * Route ids with an active WHOLE_ROUTE closure only.
 * Partial (SEVERED/SKIPPED) disruptions must not count as fully closed for
 * KPIs / CSV — use active closure records + geo segment features instead.
 */
export async function getClosedRouteIds(now = new Date()) {
  const closures = await prisma.routeClosure.findMany({
    where: { ...activeClosureFilter(now), kind: "WHOLE_ROUTE" },
    select: { routeId: true },
  });
  return new Set(closures.map((c) => c.routeId));
}

export type ActiveClosureRow = {
  routeId: string;
  kind: ClosureKind;
  fromStopId: string | null;
  toStopId: string | null;
};

/** All active closures (any kind) for planner / geo / OTP. */
/**
 * How long an active-closure read is reused.
 *
 * Every journey plan and every map load asks the same question, and the answer
 * changes when an operator opens or closes a route — minutes apart at worst,
 * usually hours. Ten seconds is short enough that an emergency closure reaches
 * riders while the operator is still looking at the screen, and long enough to
 * collapse a burst of concurrent planning requests onto one query.
 *
 * The window is deliberately tiny rather than absent: closures are the one piece
 * of state where being stale means routing somebody into a blocked road.
 */
const CLOSURE_CACHE_MS = 10_000;

let closureCache: { at: number; rows: ActiveClosureRow[] } | null = null;

/** Drop the cached read. Call after any write that opens or closes a route. */
export function invalidateClosureCache(): void {
  closureCache = null;
}

export async function getActiveClosures(
  now?: Date,
): Promise<ActiveClosureRow[]> {
  // Only the default "right now" read is cached. A caller asking about a
  // specific instant wants that instant, not whatever was last computed.
  const live = now === undefined;
  if (live && closureCache && Date.now() - closureCache.at < CLOSURE_CACHE_MS) {
    return closureCache.rows;
  }

  const rows = await prisma.routeClosure.findMany({
    where: activeClosureFilter(now ?? new Date()),
    select: {
      routeId: true,
      kind: true,
      fromStopId: true,
      toStopId: true,
    },
  });
  const mapped = rows.map((r) => ({
    routeId: r.routeId,
    kind: r.kind as ClosureKind,
    fromStopId: r.fromStopId,
    toStopId: r.toStopId,
  }));

  if (live) closureCache = { at: Date.now(), rows: mapped };
  return mapped;
}

/** Route ids to feed OTP `banned.routes` (WHOLE_ROUTE + SEVERED). */
export function otpBanRouteIds(closures: ActiveClosureRow[]): string[] {
  return [
    ...new Set(
      closures
        .filter((c) => c.kind === "WHOLE_ROUTE" || c.kind === "SEVERED")
        .map((c) => c.routeId),
    ),
  ];
}

export interface FareSummary {
  kind: "FLAT" | "TIERED";
  label: string;
}

export function summarizeFare(fare: {
  kind: "FLAT" | "TIERED";
  flatAmountEtb: { toNumber(): number } | null;
  tiers: { amountEtb: { toNumber(): number } }[];
} | null): FareSummary | null {
  if (!fare) return null;
  if (fare.kind === "FLAT") {
    const amount = fare.flatAmountEtb?.toNumber() ?? 0;
    return { kind: "FLAT", label: `Flat · ${amount} ETB` };
  }
  const prices = fare.tiers.map((t) => t.amountEtb.toNumber());
  if (prices.length === 0) return { kind: "TIERED", label: "Tiered" };
  return {
    kind: "TIERED",
    label: `Tiered · ${Math.min(...prices)}–${Math.max(...prices)} ETB`,
  };
}
