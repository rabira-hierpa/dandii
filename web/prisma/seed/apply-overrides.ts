/**
 * Re-apply operator corrections after a reseed.
 *
 * The seed reloads the vendored DT4A feed verbatim, which throws away every
 * console edit. Overrides live in their own tables (no FK to stop/route, so a
 * `deleteMany` can't cascade them away) and are replayed here as the seed's
 * final step. That makes a reseed reproducible: base feed + overrides always
 * lands on the same edited state.
 *
 * A null column means "not edited" and falls back to the base value, so an
 * override row carrying one corrected name doesn't freeze the route's colors.
 * Override rows whose stop/route no longer exists in a newer feed are ignored
 * rather than deleted — the id may come back in the next feed revision, and
 * silently dropping an operator's work is worse than carrying a dead row.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { OperatorCode } from "../../src/generated/prisma/enums";

export interface OverrideApplyResult {
  stopsRenamed: number;
  routesEdited: number;
  operatorsReassigned: number;
  stopsDeleted: number;
  routesDeleted: number;
  stopTimesRemoved: number;
  skipped: number;
}

export async function applyOverrides(
  prisma: PrismaClient,
): Promise<OverrideApplyResult> {
  const result: OverrideApplyResult = {
    stopsRenamed: 0,
    routesEdited: 0,
    operatorsReassigned: 0,
    stopsDeleted: 0,
    routesDeleted: 0,
    stopTimesRemoved: 0,
    skipped: 0,
  };

  result.skipped += await applyStopOverrides(prisma, result);
  result.skipped += await applyRouteOverrides(prisma, result);
  return result;
}

async function applyStopOverrides(
  prisma: PrismaClient,
  result: OverrideApplyResult,
): Promise<number> {
  // Tombstones first: the feed has just put these rows back, and honouring the
  // deletion means removing them again. The stop_times go with them (the FK
  // cascades), which is the point — the operator said the stop isn't real, so
  // no trip should call at it. The guard against tombstoning a stop other
  // routes still depend on lives in the server action, before the row is ever
  // written; by the time we get here the decision has been made.
  const tombstoned = await prisma.stopOverride.findMany({
    where: { deletedAt: { not: null } },
    select: { stopId: true },
  });
  if (tombstoned.length > 0) {
    const ids = tombstoned.map((t) => t.stopId);
    result.stopTimesRemoved += await prisma.stopTime
      .count({ where: { stopId: { in: ids } } })
      .catch(() => 0);
    const removed = await prisma.stop.deleteMany({
      where: { id: { in: ids }, origin: "FEED" },
    });
    result.stopsDeleted += removed.count;
  }

  const overrides = await prisma.stopOverride.findMany({
    where: { name: { not: null }, deletedAt: null },
    select: { stopId: true, name: true },
  });
  if (overrides.length === 0) return 0;

  const live = new Set(
    (
      await prisma.stop.findMany({
        where: { id: { in: overrides.map((o) => o.stopId) } },
        select: { id: true },
      })
    ).map((s) => s.id),
  );

  let skipped = 0;
  for (const o of overrides) {
    if (!live.has(o.stopId)) {
      skipped++;
      continue;
    }
    await prisma.stop.update({
      where: { id: o.stopId },
      data: { name: o.name as string },
    });
    result.stopsRenamed++;
  }
  return skipped;
}

async function applyRouteOverrides(
  prisma: PrismaClient,
  result: OverrideApplyResult,
): Promise<number> {
  const tombstoned = await prisma.routeOverride.findMany({
    where: { deletedAt: { not: null } },
    select: { routeId: true },
  });
  if (tombstoned.length > 0) {
    // Cascades this route's own trips/stop_times only — contained, unlike a stop.
    const removed = await prisma.route.deleteMany({
      where: { id: { in: tombstoned.map((t) => t.routeId) }, origin: "FEED" },
    });
    result.routesDeleted += removed.count;
  }

  const overrides = await prisma.routeOverride.findMany({
    where: { deletedAt: null },
  });
  if (overrides.length === 0) return 0;

  const live = new Set(
    (
      await prisma.route.findMany({
        where: { id: { in: overrides.map((o) => o.routeId) } },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  const operatorIdByCode = new Map(
    (await prisma.operator.findMany({ select: { id: true, code: true } })).map(
      (o) => [o.code, o.id],
    ),
  );

  let skipped = 0;
  for (const o of overrides) {
    if (!live.has(o.routeId)) {
      skipped++;
      continue;
    }

    const data: Record<string, string | number> = pickEdited({
      shortName: o.shortName,
      longName: o.longName,
      color: o.color,
      textColor: o.textColor,
    });
    // `desc`, `url` and the continuous_* flags have no Route column — they are
    // export-only fields, folded into routes.txt by lib/gtfs-overrides.ts.
    if (o.type !== null) data.type = o.type;
    if (Object.keys(data).length > 0) {
      await prisma.route.update({ where: { id: o.routeId }, data });
      result.routesEdited++;
    }

    if (o.operatorCode) {
      await reassignOperator(
        prisma,
        o.routeId,
        o.operatorCode,
        operatorIdByCode,
      );
      result.operatorsReassigned++;
    }
  }
  return skipped;
}

/** Drop null (= unedited) fields so they fall back to the base feed value. */
function pickEdited(
  fields: Record<string, string | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

/**
 * Reassigning an operator rewrites RouteAssignment, which drives the
 * per-operator `agency_id` in the export and therefore OTP's agency bans —
 * i.e. operator filtering and minibus-first ranking follow the edit.
 */
async function reassignOperator(
  prisma: PrismaClient,
  routeId: string,
  code: OperatorCode,
  operatorIdByCode: Map<OperatorCode, string>,
): Promise<void> {
  const operatorId = operatorIdByCode.get(code);
  if (!operatorId) return;
  await prisma.routeAssignment.upsert({
    where: { routeId },
    create: { routeId, operatorId },
    update: { operatorId },
  });
}
