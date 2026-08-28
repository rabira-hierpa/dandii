import { describe, expect, it } from "vitest";
import { buildRouteGeometry } from "./build-geojson";

/**
 * The tolerance that decides how accurate every drawn route line is.
 *
 * These assert metres, not vertex counts, because metres are what the operator
 * sees: at zoom 17 (~1.2 m/px) a 13.8 m deviation is a dozen pixels and a curve
 * renders as a visible polygon.
 */

const toRad = (d: number) => (d * Math.PI) / 180;

/** Perpendicular distance from a point to a segment, in metres. */
function perpM(pt: number[], a: number[], b: number[]): number {
  const mx = 111320 * Math.cos(toRad(pt[1]));
  const my = 110540;
  const P = [pt[0] * mx, pt[1] * my];
  const A = [a[0] * mx, a[1] * my];
  const B = [b[0] * mx, b[1] * my];
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(P[0] - A[0], P[1] - A[1]);
  let t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
}

/** Worst deviation of the original line from its simplified rendering. */
function maxDeviationM(
  full: [number, number][],
  simplified: [number, number][],
): number {
  let worst = 0;
  for (const pt of full) {
    let best = Infinity;
    for (let j = 0; j < simplified.length - 1; j++) {
      best = Math.min(best, perpM(pt, simplified[j], simplified[j + 1]));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

/**
 * A roundabout at Megenagna, sampled every 10 degrees. This is the exact shape
 * the old tolerance destroyed — the report screenshot showed route lines
 * cutting a polygon straight across a circle like this one.
 */
function roundabout(radiusM = 40, steps = 36): [number, number][] {
  const lat = 9.0194;
  const lon = 38.8005;
  const dLat = radiusM / 110540;
  const dLon = radiusM / (111320 * Math.cos(toRad(lat)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)] as [
      number,
      number,
    ];
  });
}

/** A gently curving corridor, sampled every ~25 m like a real GTFS shape. */
function corridor(points = 200): [number, number][] {
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    return [
      38.7613 + t * 0.03,
      9.0107 + t * 0.02 + Math.sin(t * Math.PI * 3) * 0.002,
    ] as [number, number];
  });
}

describe("buildRouteGeometry", () => {
  it("keeps the simplified line within ~1.1 m of the road", () => {
    const full = corridor();

    const built = buildRouteGeometry(full);

    expect(built).not.toBeNull();
    const dev = maxDeviationM(
      full,
      built!.geojsonSimplified.coordinates as [number, number][],
    );
    // The old tolerance allowed 13.8 m here. Anything above ~1.5 m means the
    // constant drifted back up and route lines will visibly leave the road.
    expect(dev).toBeLessThan(1.5);
  });

  it("keeps a roundabout curved instead of collapsing it to a polygon", () => {
    const full = roundabout();

    const built = buildRouteGeometry(full);

    const simplified = built!.geojsonSimplified.coordinates as [number, number][];
    // 37 points in; the old tolerance cut this to a handful of chords that
    // visibly cut the corner. Demand most of the curve survives.
    expect(simplified.length).toBeGreaterThan(full.length * 0.5);
    expect(maxDeviationM(full, simplified)).toBeLessThan(1.5);
  });

  it("still simplifies — a straight line does not need every point", () => {
    // Otherwise the tolerance is effectively zero and we ship the full geometry
    // under a name that says we didn't.
    const straight: [number, number][] = Array.from(
      { length: 50 },
      (_, i) => [38.76 + i * 0.0005, 9.01] as [number, number],
    );

    const built = buildRouteGeometry(straight);

    expect(built!.geojsonSimplified.coordinates.length).toBeLessThan(10);
  });

  it("measures length from the full line, not the simplified one", () => {
    // Fare tiers are distance-banded, so if length tracked the simplified line
    // a tolerance change would silently move fares.
    const full = corridor();

    const dense = buildRouteGeometry(full)!;
    const sparse = buildRouteGeometry(
      full.filter((_, i) => i % 2 === 0),
    )!;

    // Same corridor sampled two ways: lengths agree within a percent because
    // both are measured on their own FULL input, not on a simplified copy.
    const drift = Math.abs(dense.lengthMeters - sparse.lengthMeters);
    expect(drift / dense.lengthMeters).toBeLessThan(0.01);
  });

  it("returns the full line untouched as geojson", () => {
    const full = corridor(20);

    const built = buildRouteGeometry(full);

    expect(built!.geojson.coordinates).toEqual(full);
  });

  it("refuses a line with fewer than two points", () => {
    expect(buildRouteGeometry([[38.76, 9.01]])).toBeNull();
    expect(buildRouteGeometry([])).toBeNull();
  });
});
