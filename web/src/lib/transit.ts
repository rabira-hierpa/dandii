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
export async function getActiveClosures(
  now = new Date(),
): Promise<ActiveClosureRow[]> {
  const rows = await prisma.routeClosure.findMany({
    where: activeClosureFilter(now),
    select: {
      routeId: true,
      kind: true,
      fromStopId: true,
      toStopId: true,
    },
  });
  return rows.map((r) => ({
    routeId: r.routeId,
    kind: r.kind as ClosureKind,
    fromStopId: r.fromStopId,
    toStopId: r.toStopId,
  }));
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
