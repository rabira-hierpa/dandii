import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermissionScope } from "@/lib/session";
import type { FareHistoryEntry, FareSnapshot } from "@/types/fares";

/** How many entries a route's history shows. Older ones stay in the table. */
const LIMIT = 50;

/**
 * `FareChangeLog` stores a tier array as Json; the console only needs to know
 * how many bands there were, so the shape is narrowed here rather than
 * shipping raw Json to the browser.
 */
function snapshot(
  kind: "FLAT" | "TIERED" | null,
  flat: { toString: () => string } | null,
  tiers: unknown,
): FareSnapshot {
  return {
    kind,
    flatEtb: flat ? flat.toString() : null,
    tierCount: Array.isArray(tiers) ? tiers.length : 0,
  };
}

/**
 * One route's fare history, newest first.
 *
 * Read-only and behind `fare: ["read"]`, which every console role holds —
 * a maintainer who cannot change a fare still needs to see who did.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const { routeWhere } = await requirePermissionScope({ fare: ["read"] });
  const { routeId } = await params;

  // Same 404-shaped refusal as the route detail: an empty history and a
  // history you may not see must look identical from outside.
  const visible = await prisma.route.findFirst({
    where: { id: routeId, ...routeWhere },
    select: { id: true },
  });
  if (!visible) {
    return Response.json({ error: "Route not found" }, { status: 404 });
  }

  const rows = await prisma.fareChangeLog.findMany({
    where: { routeId },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
    select: {
      id: true,
      source: true,
      proposalId: true,
      createdAt: true,
      changedById: true,
      beforeKind: true,
      beforeFlatEtb: true,
      beforeTiers: true,
      afterKind: true,
      afterFlatEtb: true,
      afterTiers: true,
    },
  });

  // No FK from the log to User (the changer may since have been deleted), so
  // the names are looked up separately and a missing one degrades to a label
  // rather than dropping the entry.
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.changedById))] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const entries: FareHistoryEntry[] = rows.map((row) => ({
    id: row.id,
    source: row.source,
    changedByName: nameById.get(row.changedById) ?? "a removed account",
    proposalId: row.proposalId,
    createdAt: row.createdAt.toISOString(),
    before: snapshot(row.beforeKind, row.beforeFlatEtb, row.beforeTiers),
    after: snapshot(row.afterKind, row.afterFlatEtb, row.afterTiers),
  }));

  return Response.json(entries, {
    headers: { "Cache-Control": "no-store" },
  });
}
