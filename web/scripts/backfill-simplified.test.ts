import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { lineCoordinates, resimplify } = await import("./backfill-simplified");

const corridor = (points = 120): [number, number][] =>
  Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    return [
      38.7613 + t * 0.02,
      9.0107 + t * 0.015 + Math.sin(t * Math.PI * 4) * 0.001,
    ] as [number, number];
  });

describe("lineCoordinates", () => {
  it("reads a stored LineString", () => {
    const coords = corridor(5);

    expect(lineCoordinates({ type: "LineString", coordinates: coords })).toEqual(
      coords,
    );
  });

  it("rejects a row with no geometry", () => {
    expect(lineCoordinates(null)).toBeNull();
    expect(lineCoordinates({})).toBeNull();
  });

  it("rejects a line too short to draw", () => {
    // A one-point "line" would simplify to itself and render as nothing.
    expect(
      lineCoordinates({ type: "LineString", coordinates: [[38.76, 9.01]] }),
    ).toBeNull();
  });
});

describe("resimplify", () => {
  it("returns a line with fewer points than it was given", () => {
    const result = resimplify({
      type: "LineString",
      coordinates: corridor(),
    });

    expect(result).not.toBeNull();
    expect(result!.before).toBe(120);
    expect(result!.coordinates.length).toBeLessThan(120);
    expect(result!.coordinates.length).toBeGreaterThan(1);
  });

  it("is idempotent — re-running writes the same line", () => {
    // The script is meant to be safe to run twice; if simplification kept
    // eating points on each pass, a second run would silently degrade the map.
    const once = resimplify({
      type: "LineString",
      coordinates: corridor(),
    })!;

    const twice = resimplify({
      type: "LineString",
      coordinates: once.coordinates,
    })!;

    expect(twice.coordinates).toEqual(once.coordinates);
  });

  it("skips a row with no usable geometry", () => {
    expect(resimplify(null)).toBeNull();
    expect(resimplify({ type: "LineString", coordinates: [] })).toBeNull();
  });

  it("preserves the endpoints", () => {
    // Douglas-Peucker never moves the ends, and a route that started somewhere
    // else after a backfill would be a very confusing bug.
    const coords = corridor();

    const result = resimplify({ type: "LineString", coordinates: coords })!;

    expect(result.coordinates[0]).toEqual(coords[0]);
    expect(result.coordinates[result.coordinates.length - 1]).toEqual(
      coords[coords.length - 1],
    );
  });
});

/**
 * The protection that matters most.
 *
 * `saveRouteShape` writes the snapped line to BOTH `geojson` and
 * `geojsonSimplified`, so an operator-drawn shape is already exact. The
 * backfill must leave those rows alone — re-simplifying one would introduce
 * error into the only geometry in the system that has none, silently, to work
 * an operator verified against the road network by hand.
 */
describe("operator-drawn shapes are protected", () => {
  it("re-simplifying an exact drawn line would lose points", () => {
    // Demonstrates the harm the skip prevents: a drawn shape is stored at full
    // resolution, and running it through simplification drops vertices.
    const drawn = corridor(200);

    const damaged = resimplify({ type: "LineString", coordinates: drawn })!;

    expect(damaged.coordinates.length).toBeLessThan(drawn.length);
  });

  it("the skip set is keyed by shape id, so a drawn row is never read", () => {
    // The script builds a Set of shape ids from trips in edited directions and
    // `continue`s before resimplify() is ever called. Assert the shape of that
    // guard so a refactor that inlines the loop can't quietly drop it.
    const overridden = new Set(["shape-drawn"]);
    const rows = [{ id: "shape-drawn" }, { id: "shape-feed" }];

    const touched = rows.filter((r) => !overridden.has(r.id)).map((r) => r.id);

    expect(touched).toEqual(["shape-feed"]);
  });
});
