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
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import type { OperatorCode } from "../../src/generated/prisma/enums";

export interface OverrideApplyResult {
  stopsRenamed: number;
  routesEdited: number;
  operatorsReassigned: number;
  stopsDeleted: number;
  routesDeleted: number;
  stopTimesRemoved: number;
  directionsReordered: number;
  tripsEdited: number;
  shapesRedrawn: number;
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
    directionsReordered: 0,
    tripsEdited: 0,
    shapesRedrawn: 0,
    skipped: 0,
  };

  result.skipped += await applyStopOverrides(prisma, result);
  result.skipped += await applyRouteOverrides(prisma, result);
  result.skipped += await applyStopOrderOverrides(prisma, result);
  result.skipped += await applyTripOverrides(prisma, result);
  result.skipped += await applyShapeOverrides(prisma, result);
  return result;
}

/**
 * Replay per-trip edits. Only `headsign` has a Trip column; `blockId` lives on
 * the override alone and reaches riders through the regenerated feed.
 */
async function applyTripOverrides(
  prisma: PrismaClient,
  result: OverrideApplyResult,
): Promise<number> {
  const overrides = await prisma.tripOverride.findMany({
    where: { headsign: { not: null } },
    select: { tripId: true, headsign: true },
  });
  if (overrides.length === 0) return 0;

  const live = new Set(
    (
      await prisma.trip.findMany({
        where: { id: { in: overrides.map((o) => o.tripId) } },
        select: { id: true },
      })
    ).map((t) => t.id),
  );

  let skipped = 0;
  for (const o of overrides) {
    if (!live.has(o.tripId)) {
      skipped++;
      continue;
    }
    await prisma.trip.update({
      where: { id: o.tripId },
      data: { headsign: o.headsign },
    });
    result.tripsEdited++;
  }
  return skipped;
}

/**
 * Replay reordered stop sequences.
 *
 * The feed has just restored its own ordering, so without this a reseed would
 * quietly undo every reorder an operator made. Skips a direction whose stop set
 * no longer matches the saved order — a newer feed may have added or dropped a
 * call, and forcing a stale order onto it would silently delete real stops.
 */
async function applyStopOrderOverrides(
  prisma: PrismaClient,
  result: OverrideApplyResult,
): Promise<number> {
  const orders = await prisma.routeStopOrderOverride.findMany();
  if (orders.length === 0) return 0;

  let skipped = 0;
  for (const order of orders) {
    const trips = await prisma.trip.findMany({
      where: { routeId: order.routeId, directionId: order.directionId },
      select: {
        id: true,
        stopTimes: {
          orderBy: { sequence: "asc" },
          select: { stopId: true, arrival: true, departure: true },
        },
      },
    });
    if (trips.length === 0) {
      skipped++;
      continue;
    }

    const current = new Set(trips[0].stopTimes.map((st) => st.stopId));
    const sameSet =
      current.size === order.stopIds.length &&
      order.stopIds.every((id) => current.has(id));
    if (!sameSet) {
      skipped++;
      continue;
    }

    for (const trip of trips) {
      // Times belong to positions, not stops — see reorderRouteStops.
      const times = trip.stopTimes.map((st) => ({
        arrival: st.arrival,
        departure: st.departure,
      }));
      await prisma.stopTime.deleteMany({ where: { tripId: trip.id } });
      await prisma.stopTime.createMany({
        data: order.stopIds.map((stopId, i) => ({
          tripId: trip.id,
          stopId,
          sequence: i + 1,
          arrival: times[i]?.arrival ?? null,
          departure: times[i]?.departure ?? null,
        })),
      });
    }
    result.directionsReordered++;
  }
  return skipped;
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
    where: {
      deletedAt: null,
      OR: [{ name: { not: null } }, { nameAm: { not: null } }],
    },
    select: { stopId: true, name: true, nameAm: true },
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
      data: {
        ...(o.name !== null ? { name: o.name } : {}),
        ...(o.nameAm !== null ? { nameAm: o.nameAm } : {}),
      },
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

/**
 * Replay operator-drawn route geometry.
 *
 * A reseed reloads the vendored feed's shapes, so without this every line an
 * operator drew is silently replaced by DT4A's original the next time the feed
 * is loaded — the one edit whose whole point is that the feed is wrong about
 * where the road goes.
 *
 * The stored `geojson` is the line the server snapped and approved, so it is
 * written back verbatim rather than re-snapped: OTP's graph moves between
 * rebuilds, and re-snapping would let a graph update quietly redraw geometry a
 * human signed off on.
 */
async function applyShapeOverrides(
  prisma: PrismaClient,
  result: OverrideApplyResult,
): Promise<number> {
  const overrides = await prisma.shapeOverride.findMany({
    select: { routeId: true, directionId: true, geojson: true },
  });
  if (overrides.length === 0) return 0;

  let skipped = 0;
  for (const override of overrides) {
    const coords = (override.geojson as { coordinates?: number[][] } | null)
      ?.coordinates;
    if (!coords || coords.length < 2) {
      skipped++;
      continue;
    }

    const trips = await prisma.trip.findMany({
      where: {
        routeId: override.routeId,
        directionId: override.directionId,
        shapeId: { not: null },
      },
      select: { shapeId: true },
    });
    const shapeIds = [...new Set(trips.map((t) => t.shapeId as string))];
    if (shapeIds.length === 0) {
      // The route or direction is gone in this feed revision.
      skipped++;
      continue;
    }

    const geojson = {
      type: "LineString",
      coordinates: coords,
    } as unknown as Prisma.InputJsonValue;

    await prisma.shape.updateMany({
      where: { id: { in: shapeIds } },
      data: { geojson, geojsonSimplified: geojson },
    });
    // The rider map draws the outbound shape (see seed/index.ts).
    if (override.directionId === 0) {
      await prisma.route.updateMany({
        where: { id: override.routeId },
        data: { geojson, geojsonSimplified: geojson },
      });
    }
    result.shapesRedrawn++;
  }
  return skipped;
}
