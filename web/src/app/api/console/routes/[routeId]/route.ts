import type { NextRequest } from "next/server";
import type { OperatorCode } from "@/lib/operators";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import type {
  RouteDirection,
  RouteEditorDetail,
  RouteStopRow,
} from "@/types/console";

/**
 * Everything the console route editor needs for one route: effective values,
 * the raw override row (so the form can distinguish "edited to X" from "the
 * base happens to be X"), each direction, and the stops per direction.
 *
 * Behind the same `feedEdit` permission as the actions that write it — the
 * override row names who edited what, which is not public data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  await requirePermission({ feedEdit: ["edit"] });
  const { routeId } = await params;

  const route = await prisma.route.findUnique({
    where: { id: routeId },
    select: {
      id: true,
      shortName: true,
      longName: true,
      type: true,
      color: true,
      textColor: true,
      agencyId: true,
      origin: true,
      assignment: { select: { operator: { select: { code: true } } } },
    },
  });
  if (!route) {
    return Response.json({ error: "Route not found" }, { status: 404 });
  }

  const [override, trips] = await Promise.all([
    prisma.routeOverride.findUnique({ where: { routeId } }),
    prisma.trip.findMany({
      where: { routeId },
      orderBy: [{ directionId: "asc" }, { id: "asc" }],
      select: {
        id: true,
        directionId: true,
        headsign: true,
        shapeId: true,
        shape: { select: { geojson: true } },
        stopTimes: {
          orderBy: { sequence: "asc" },
          select: {
            sequence: true,
            stop: {
              select: { id: true, name: true, lat: true, lon: true, origin: true },
            },
          },
        },
      },
    }),
  ]);

  // One representative trip per direction — trips in a direction share a stop
  // pattern, and the editor edits the pattern, not the individual runs.
  const byDirection = new Map<number, (typeof trips)[number]>();
  const tripCounts = new Map<number, number>();
  for (const t of trips) {
    const dir = t.directionId ?? 0;
    tripCounts.set(dir, (tripCounts.get(dir) ?? 0) + 1);
    if (!byDirection.has(dir)) byDirection.set(dir, t);
  }

  const allStopIds = [
    ...new Set(
      trips.flatMap((t) => t.stopTimes.map((st) => st.stop.id)),
    ),
  ];
  // How many OTHER routes serve each stop — the delete guard reads this, and
  // the operator sees it before trying.
  const usage = await prisma.stopTime.findMany({
    where: { stopId: { in: allStopIds } },
    select: { stopId: true, trip: { select: { routeId: true } } },
  });
  const otherRoutes = new Map<string, Set<string>>();
  for (const u of usage) {
    if (u.trip.routeId === routeId) continue;
    const set = otherRoutes.get(u.stopId) ?? new Set<string>();
    set.add(u.trip.routeId);
    otherRoutes.set(u.stopId, set);
  }

  const editedStopIds = new Set(
    (
      await prisma.stopOverride.findMany({
        where: { stopId: { in: allStopIds }, name: { not: null } },
        select: { stopId: true },
      })
    ).map((s) => s.stopId),
  );

  const directions: RouteDirection[] = [];
  const stopsByDirection: Record<number, RouteStopRow[]> = {};
  for (const [dir, trip] of [...byDirection].sort((a, b) => a[0] - b[0])) {
    const coords = (trip.shape?.geojson as GeoJSON.LineString | null)
      ?.coordinates;
    directions.push({
      directionId: dir,
      headsign: trip.headsign,
      shapeId: trip.shapeId,
      shapePoints: coords?.length ?? 0,
      tripCount: tripCounts.get(dir) ?? 0,
      stopCount: trip.stopTimes.length,
    });
    stopsByDirection[dir] = trip.stopTimes.map((st) => ({
      id: st.stop.id,
      name: st.stop.name,
      lat: st.stop.lat,
      lon: st.stop.lon,
      sequence: st.sequence,
      operatorCreated: st.stop.origin === "OPERATOR",
      edited: editedStopIds.has(st.stop.id),
      otherRouteCount: otherRoutes.get(st.stop.id)?.size ?? 0,
    }));
  }

  const detail: RouteEditorDetail = {
    id: route.id,
    shortName: route.shortName,
    longName: route.longName,
    type: route.type,
    color: route.color,
    textColor: route.textColor,
    operatorCode: (route.assignment?.operator.code as OperatorCode) ?? null,
    agencyId: route.agencyId,
    operatorCreated: route.origin === "OPERATOR",
    override: override
      ? {
          shortName: override.shortName,
          longName: override.longName,
          desc: override.desc,
          url: override.url,
          type: override.type,
          color: override.color,
          textColor: override.textColor,
          operatorCode: override.operatorCode as OperatorCode | null,
          continuousPickup: override.continuousPickup,
          continuousDropOff: override.continuousDropOff,
        }
      : null,
    directions,
    stopsByDirection,
  };

  return Response.json(detail, {
    // Operator-facing and edited constantly — never serve a stale form.
    headers: { "Cache-Control": "no-store" },
  });
}
