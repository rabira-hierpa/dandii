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
  skipped: number;
}

export async function applyOverrides(
  prisma: PrismaClient,
): Promise<OverrideApplyResult> {
  const result: OverrideApplyResult = {
    stopsRenamed: 0,
    routesEdited: 0,
    operatorsReassigned: 0,
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
  const overrides = await prisma.stopOverride.findMany({
    where: { name: { not: null } },
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
  const overrides = await prisma.routeOverride.findMany();
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

    const data = pickEdited({
      shortName: o.shortName,
      longName: o.longName,
      color: o.color,
      textColor: o.textColor,
    });
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
