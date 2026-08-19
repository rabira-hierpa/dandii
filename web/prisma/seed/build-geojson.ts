import { lineString } from "@turf/helpers";
import length from "@turf/length";
import simplify from "@turf/simplify";
import type { GtfsShapePoint } from "./parse-gtfs";

export interface RouteGeometry {
  /** Full-resolution LineString geometry. */
  geojson: GeoJSON.LineString;
  /** Simplified LineString for the all-routes network layer. */
  geojsonSimplified: GeoJSON.LineString;
  lengthMeters: number;
}

/** Groups shape points by shape_id into ordered [lon, lat] coordinate lists. */
export function groupShapes(
  points: GtfsShapePoint[],
): Map<string, [number, number][]> {
  const grouped = new Map<string, { seq: number; coord: [number, number] }[]>();
  for (const p of points) {
    let list = grouped.get(p.shape_id);
    if (!list) {
      list = [];
      grouped.set(p.shape_id, list);
    }
    list.push({
      seq: Number(p.shape_pt_sequence),
      coord: [Number(p.shape_pt_lon), Number(p.shape_pt_lat)],
    });
  }
  const result = new Map<string, [number, number][]>();
  for (const [shapeId, list] of grouped) {
    list.sort((a, b) => a.seq - b.seq);
    result.set(
      shapeId,
      list.map((p) => p.coord),
    );
  }
  return result;
}

/**
 * Douglas-Peucker tolerance, in degrees, for the geometry both maps render.
 *
 * At Addis latitude one degree of longitude is ~110 km, so this is about **1.1
 * metres** of allowed deviation from the true road centreline.
 *
 * It used to be `0.0001` (~11 m), which kept 12% of each shape's vertices and
 * put the drawn line up to 13.8 m off the road — measured over 58 shapes and
 * 10,406 points. Below zoom 15 that is invisible; at zoom 17 it is 6-12 pixels
 * and a curve renders as a visible polygon, which is why route lines cut
 * straight across the Megenagna roundabout instead of following it. Operators
 * drawing a shape were comparing their work against a line that was itself
 * wrong.
 *
 * The measured cost of the change, over 119 routes:
 *
 *   tolerance    pts/route   p90 dev   max dev   payload
 *   0.0001            27      6.8 m    11.0 m    0.22 MB
 *   0.00001          102      0.7 m     1.1 m    0.82 MB
 *   0 (no simplify)  234        0         0      1.87 MB
 *
 * 1.1 m is sub-pixel below zoom 19, so this buys the last of the visible error
 * without paying for the full geometry.
 */
const SIMPLIFY_TOLERANCE = 0.00001;

export function buildRouteGeometry(
  coordinates: [number, number][],
): RouteGeometry | null {
  if (coordinates.length < 2) return null;
  const line = lineString(coordinates);
  const simplified = simplify(line, {
    tolerance: SIMPLIFY_TOLERANCE,
    // Pure Douglas-Peucker. The fast path prepends a radial-distance pass that
    // drops points on its own, which is why stored geometry measured 13.8 m of
    // error where the tolerance alone predicts 11.0 m. Same tolerance, less
    // error, and the seed runs once.
    highQuality: true,
    mutate: false,
  });
  return {
    geojson: line.geometry,
    geojsonSimplified: simplified.geometry,
    lengthMeters: Math.round(length(line, { units: "kilometers" }) * 1000),
  };
}
