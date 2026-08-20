/**
 * Per-direction route geometry for the console map.
 *
 * The public map draws one line per route (`Route.geojsonSimplified`, which the
 * seed points at the inbound shape) because riders want a legible network, not
 * a doubled corridor. Operators want the opposite: they edit each direction's
 * line separately, so the console asks for every shape.
 *
 * Closure splitting has to run per direction. A route's two directions visit
 * the same stops in opposite order, so a closed range that is stops 3–5
 * outbound is stops 1–3 inbound — `closedWindow` already normalises that (it
 * was written for reverse-direction trips), but it must be fed each direction's
 * own stop sequence rather than one shared list.
 */
import {
  closedWindow,
  splitShapeByClosureWindow,
  type ClosureRange,
} from "@/lib/closures";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveClosures } from "@/lib/transit";

interface ActiveClosure {
  routeId: string;
  kind: string;
  fromStopId: string | null;
  toStopId: string | null;
}

/** Real-world endpoints of a closed range, for directions that don't serve its stops. */
export interface ClosureAnchors {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
}

interface RouteMeta {
  id: string;
  shortName: string;
  longName: string;
  type: number;
  lengthMeters: number | null;
  operatorCode: string | null;
  /** Operator-chosen line colour, null when they haven't set one. */
  colorOverride: string | null;
}

/** One direction of one route: its shape plus the stop order trips run it in. */
interface DirectionalShape {
  routeId: string;
  directionId: number | null;
  shapeId: string;
  full: number[][];
  simplified: number[][];
  stops: { id: string; lat: number; lon: number }[];
}

/**
 * Load every route's shapes, one row per (route, direction). `distinct` picks a
 * single representative trip per direction — they share a shape by definition.
 */
export async function loadDirectionalShapes(): Promise<DirectionalShape[]> {
  const trips = await prisma.trip.findMany({
    where: { shapeId: { not: null } },
    distinct: ["routeId", "directionId"],
    orderBy: [{ routeId: "asc" }, { directionId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      routeId: true,
      directionId: true,
      shapeId: true,
      shape: { select: { geojson: true, geojsonSimplified: true } },
      stopTimes: {
        orderBy: { sequence: "asc" },
        select: { stop: { select: { id: true, lat: true, lon: true } } },
      },
    },
  });

  const out: DirectionalShape[] = [];
  for (const t of trips) {
    const full = (t.shape?.geojson as GeoJSON.LineString | null)?.coordinates;
    const simplified = (t.shape?.geojsonSimplified as GeoJSON.LineString | null)
      ?.coordinates;
    if (!full || !simplified || !t.shapeId) continue;
    out.push({
      routeId: t.routeId,
      directionId: t.directionId,
      shapeId: t.shapeId,
      full,
      simplified,
      stops: t.stopTimes.map((st) => st.stop),
    });
  }
  return out;
}

/**
 * Features for one direction of one route, split at the closed range when a
 * partial closure applies to it.
 *
 * When the closure can't be located on this direction — by stop ids or by
 * geometry — the direction is drawn open, because "not on this line" is what
 * both of those failures actually mean.
 */
function featuresForDirection(
  shape: DirectionalShape,
  meta: RouteMeta,
  closures: ActiveClosure[],
  closureAnchors: ClosureAnchors | null,
): GeoJSON.Feature[] {
  const baseProps = {
    routeId: meta.id,
    shortName: meta.shortName,
    longName: meta.longName,
    routeType: meta.type,
    operatorCode: meta.operatorCode,
    lengthMeters: meta.lengthMeters,
    directionId: shape.directionId,
    shapeId: shape.shapeId,
    // Omitted when unset so the layer's ["has", …] test falls through to the
    // agency palette.
    ...(meta.colorOverride ? { colorOverride: meta.colorOverride } : {}),
  };
  const key = `${meta.id}:${shape.shapeId}`;

  const whole = closures.some((c) => c.kind === "WHOLE_ROUTE");
  const partial = closures.find(
    (c) => c.kind === "SEVERED" || c.kind === "SKIPPED",
  );

  const oneFeature = (closed: boolean, segment: string): GeoJSON.Feature[] => [
    {
      type: "Feature",
      id: `${key}:${segment}`,
      geometry: { type: "LineString", coordinates: shape.simplified },
      properties: { ...baseProps, closed, segment },
    },
  ];

  if (whole) return oneFeature(true, "full");
  if (!partial) return oneFeature(false, "full");

  const seqById = new Map(shape.stops.map((s, i) => [s.id, i]));
  const range: ClosureRange = {
    kind: partial.kind as ClosureRange["kind"],
    fromStopId: partial.fromStopId,
    toStopId: partial.toStopId,
  };
  const w = closedWindow(range, seqById);
  type Point = { lat: number; lon: number };
  let from: Point | null = w ? (shape.stops[w.start] ?? null) : null;
  let to: Point | null = w ? (shape.stops[w.end] ?? null) : null;

  if (!from || !to) {
    /**
     * This direction doesn't serve the stops the closure names — which is the
     * common case, not the edge case: 406 of the 444 two-direction routes share
     * *no* stop ids between directions, because the feed gives each direction
     * its own ids (AB097 runs Legedadi Mission… outbound and Century Mall…
     * inbound).
     *
     * Stop ids can't answer "does this direction run the closed road?", so ask
     * the geometry instead. Snapping the closure's real-world endpoints onto
     * this direction's line answers it directly: if they land on the line, this
     * direction runs that road and gets split; if they don't, the closure is
     * somewhere else entirely and this direction is untouched.
     *
     * The old behaviour — paint the whole direction closed — would have shut
     * the return leg of nearly every partially closed route for no reason.
     */
    from = closureAnchors?.from ?? null;
    to = closureAnchors?.to ?? null;
    if (!from || !to) return oneFeature(false, "full");
  }

  // Slice the FULL shape, never the simplified one: simplification leaves
  // ~500m between vertices, so neighbouring stops collapse onto a single
  // vertex and the split silently degrades into a whole-route closure.
  const split = splitShapeByClosureWindow(
    shape.full,
    { lat: from.lat, lon: from.lon },
    { lat: to.lat, lon: to.lon },
  );
  // No snap means the closed stretch isn't on this line at all.
  if (!split) return oneFeature(false, "full");

  const features: GeoJSON.Feature[] = split.open.map((coords, i) => ({
    type: "Feature",
    id: `${key}:open:${i}`,
    geometry: { type: "LineString", coordinates: coords },
    properties: { ...baseProps, closed: false, segment: "open" },
  }));
  features.push({
    type: "Feature",
    id: `${key}:closed`,
    geometry: { type: "LineString", coordinates: split.closed },
    properties: { ...baseProps, closed: true, segment: "closed" },
  });
  return features;
}

/** Every direction of every route, closure-split, for the console map. */
export function buildDirectionalFeatures(
  shapes: DirectionalShape[],
  routes: RouteMeta[],
  closuresByRoute: Map<string, ActiveClosure[]>,
  anchorsByRoute: Map<string, ClosureAnchors> = new Map(),
): GeoJSON.Feature[] {
  const metaById = new Map(routes.map((r) => [r.id, r]));
  const features: GeoJSON.Feature[] = [];
  for (const shape of shapes) {
    const meta = metaById.get(shape.routeId);
    if (!meta) continue;
    features.push(
      ...featuresForDirection(
        shape,
        meta,
        closuresByRoute.get(shape.routeId) ?? [],
        anchorsByRoute.get(shape.routeId) ?? null,
      ),
    );
  }
  return features;
}

/**
 * Look up the coordinates of every active partial closure's boundary stops, so
 * a direction that doesn't serve those stops can still be tested geometrically.
 */
export async function loadClosureAnchors(
  closures: ActiveClosure[],
): Promise<Map<string, ClosureAnchors>> {
  const partial = closures.filter(
    (c) => c.fromStopId && c.toStopId && c.kind !== "WHOLE_ROUTE",
  );
  if (partial.length === 0) return new Map();

  const ids = [
    ...new Set(partial.flatMap((c) => [c.fromStopId!, c.toStopId!])),
  ];
  const stops = await prisma.stop.findMany({
    where: { id: { in: ids } },
    select: { id: true, lat: true, lon: true },
  });
  const byId = new Map(stops.map((s) => [s.id, s]));

  const out = new Map<string, ClosureAnchors>();
  for (const c of partial) {
    const from = byId.get(c.fromStopId!);
    const to = byId.get(c.toStopId!);
    if (from && to) {
      out.set(c.routeId, {
        from: { lat: from.lat, lon: from.lon },
        to: { lat: to.lat, lon: to.lon },
      });
    }
  }
  return out;
}

/**
 * The `?directions=both` feature collection — every direction as its own
 * feature, which is what both console maps render.
 *
 * Shared rather than copied because the console needs the identical geometry
 * pipeline with one difference: a `where` that limits it to the viewer's
 * operator. The public rider endpoint passes `{}` and is unaffected.
 */
export async function loadDirectionalFeatureCollection(
  routeWhere: Prisma.RouteWhereInput,
): Promise<{ features: GeoJSON.Feature[]; anyClosed: boolean }> {
  const [routes, active, colorOverrides] = await Promise.all([
    prisma.route.findMany({
      where: routeWhere,
      select: {
        id: true,
        shortName: true,
        longName: true,
        type: true,
        lengthMeters: true,
        assignment: { select: { operator: { select: { code: true } } } },
      },
    }),
    getActiveClosures(),
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

  const [shapes, anchors] = await Promise.all([
    loadDirectionalShapes(),
    loadClosureAnchors(active),
  ]);

  // Shapes are loaded whole; drop the ones whose route the viewer cannot see.
  const visible = new Set(routes.map((r) => r.id));
  const scopedShapes = shapes.filter((s) => visible.has(s.routeId));

  return {
    features: buildDirectionalFeatures(
      scopedShapes,
      routes.map((r) => ({
        id: r.id,
        shortName: r.shortName,
        longName: r.longName,
        type: r.type,
        lengthMeters: r.lengthMeters,
        operatorCode: r.assignment?.operator.code ?? null,
        colorOverride: colorByRoute.get(r.id) ?? null,
      })),
      byRoute,
      anchors,
    ),
    anyClosed: active.length > 0,
  };
}
