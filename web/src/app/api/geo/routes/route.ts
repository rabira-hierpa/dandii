import type { NextRequest } from "next/server";
import {
  closedWindow,
  splitShapeByClosureWindow,
  type ClosureRange,
} from "@/lib/closures";
import { prisma } from "@/lib/prisma";
import { loadDirectionalFeatureCollection } from "@/lib/route-shape-features";
import { getActiveClosures } from "@/lib/transit";

type RouteRow = {
  id: string;
  shortName: string;
  longName: string;
  type: number;
  geojsonSimplified: GeoJSON.LineString | null;
  lengthMeters: number | null;
  assignment: { operator: { code: string } } | null;
};

/**
 * All route shapes (simplified) as a GeoJSON FeatureCollection.
 * Partially closed routes emit open + closed segment features (same routeId,
 * unique feature `id`) so existing open/closed map layers keep working.
 *
 * `?directions=both` returns every direction as its own feature (console map).
 * The default returns one line per route — the seed points Route.geojson at the
 * inbound shape, so riders get a legible network rather than a doubled corridor.
 *
 * Cache: short TTL while any closure is active so emergency updates show up;
 * longer when the network is fully open.
 */
export async function GET(request: NextRequest) {
  const bothDirections =
    request.nextUrl.searchParams.get("directions") === "both";
  const [routes, active, colorOverrides] = await Promise.all([
    prisma.route.findMany({
      select: {
        id: true,
        shortName: true,
        longName: true,
        type: true,
        geojsonSimplified: true,
        lengthMeters: true,
        assignment: { select: { operator: { select: { code: true } } } },
      },
    }),
    getActiveClosures(),
    // Only an operator-chosen colour overrides the agency palette — see
    // ROUTE_LINE_COLOR in map-style.ts for why the feed's route_color doesn't.
    prisma.routeOverride.findMany({
      where: { color: { not: null }, deletedAt: null },
      select: { routeId: true, color: true },
    }),
  ]);
  const colorByRoute = new Map(
    colorOverrides.map((o) => [o.routeId, o.color as string]),
  );

  const byRoute = new Map<string, typeof active>();
  for (const c of active) {
    const list = byRoute.get(c.routeId) ?? [];
    list.push(c);
    byRoute.set(c.routeId, list);
  }

  if (bothDirections) {
    // Unscoped ({}) — this endpoint serves the public rider map and must keep
    // returning every route. The console calls the same helper with a filter.
    const { features: directional } = await loadDirectionalFeatureCollection({});
    return jsonWithCache(directional, active.length > 0);
  }

  const features: GeoJSON.Feature[] = [];
  for (const r of routes as RouteRow[]) {
    if (!r.geojsonSimplified) continue;
    const closures = byRoute.get(r.id) ?? [];
    const whole = closures.some((c) => c.kind === "WHOLE_ROUTE");
    const partial = closures.find(
      (c) => c.kind === "SEVERED" || c.kind === "SKIPPED",
    );

    const baseProps = {
      routeId: r.id,
      shortName: r.shortName,
      longName: r.longName,
      routeType: r.type,
      operatorCode: r.assignment?.operator.code ?? null,
      lengthMeters: r.lengthMeters,
      // Omitted entirely when unset, so the layer's ["has", …] test works.
      ...(colorByRoute.has(r.id)
        ? { colorOverride: colorByRoute.get(r.id) }
        : {}),
    };

    if (whole || !partial) {
      features.push({
        type: "Feature",
        id: `${r.id}:full`,
        geometry: r.geojsonSimplified,
        properties: { ...baseProps, closed: whole, segment: "full" },
      });
      continue;
    }

    const split = await trySplitRoute(r, partial);
    if (!split) {
      // Snap failed — honest over-paint: treat as fully disrupted on the map.
      features.push({
        type: "Feature",
        id: `${r.id}:full`,
        geometry: r.geojsonSimplified,
        properties: { ...baseProps, closed: true, segment: "full" },
      });
      continue;
    }

    for (let i = 0; i < split.open.length; i++) {
      features.push({
        type: "Feature",
        id: `${r.id}:open:${i}`,
        geometry: { type: "LineString", coordinates: split.open[i] },
        properties: { ...baseProps, closed: false, segment: "open" },
      });
    }
    features.push({
      type: "Feature",
      id: `${r.id}:closed`,
      geometry: { type: "LineString", coordinates: split.closed },
      properties: { ...baseProps, closed: true, segment: "closed" },
    });
  }

  return jsonWithCache(features, active.length > 0);
}

/** Short TTL while anything is closed so emergency updates reach riders fast. */
function jsonWithCache(features: GeoJSON.Feature[], anyClosure: boolean) {
  return Response.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": anyClosure
          ? "public, s-maxage=60, stale-while-revalidate=30"
          : "public, s-maxage=3600, stale-while-revalidate=600",
      },
    },
  );
}

async function trySplitRoute(
  route: RouteRow,
  closure: {
    kind: string;
    fromStopId: string | null;
    toStopId: string | null;
  },
): Promise<{ open: number[][][]; closed: number[][] } | null> {
  if (!closure.fromStopId || !closure.toStopId || !route.geojsonSimplified) {
    return null;
  }

  // Slice the FULL shape, not `geojsonSimplified`. Simplification leaves ~500m
  // between vertices, so neighbouring stops collapse onto one vertex (i === j)
  // and sit hundreds of metres off it — the snap fails and every partial
  // closure over-paints as a whole-route closure. Only the handful of
  // partially closed routes pay for the extra resolution.
  const full = await prisma.route.findUnique({
    where: { id: route.id },
    select: { geojson: true },
  });
  const coords = (full?.geojson as GeoJSON.LineString | null)?.coordinates;
  if (!coords || coords.length < 2) return null;

  const trip = await prisma.trip.findFirst({
    where: { routeId: route.id },
    orderBy: { id: "asc" },
    select: {
      stopTimes: {
        orderBy: { sequence: "asc" },
        select: {
          stop: { select: { id: true, lat: true, lon: true } },
        },
      },
    },
  });
  if (!trip) return null;

  const stops = trip.stopTimes.map((st) => st.stop);
  const seqById = new Map(stops.map((s, i) => [s.id, i]));
  const range: ClosureRange = {
    kind: closure.kind as ClosureRange["kind"],
    fromStopId: closure.fromStopId,
    toStopId: closure.toStopId,
  };
  const w = closedWindow(range, seqById);
  if (!w) return null;

  const fromStop = stops[w.start];
  const toStop = stops[w.end];
  if (!fromStop || !toStop) return null;

  return splitShapeByClosureWindow(
    coords,
    { lat: fromStop.lat, lon: fromStop.lon },
    { lat: toStop.lat, lon: toStop.lon },
  );
}
