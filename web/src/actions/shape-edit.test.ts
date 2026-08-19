import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The save action's contract, exercised against stubbed persistence.
 *
 * The interesting cases are all refusals: the whole point of this action is
 * that it declines to trust the browser's geometry, declines to write a shape
 * nothing will draw, and declines to let a database error escape as a throw.
 */

const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  route: { findUnique: vi.fn(), update: vi.fn() },
  trip: { findMany: vi.fn() },
  shape: { findUnique: vi.fn(), updateMany: vi.fn() },
  shapeOverride: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
}));
const snapWaypoints = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/road-snap", () => ({ snapWaypoints }));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { resetRouteShape, saveRouteShape } = await import("./shape-edit");

const MESKEL = { lat: 9.0107, lon: 38.7613 };
const KAZANCHIS = { lat: 9.0184, lon: 38.7681 };
const LINE: [number, number][] = [
  [MESKEL.lon, MESKEL.lat],
  [KAZANCHIS.lon, KAZANCHIS.lat],
];

const input = { routeId: "route-1", directionId: 0, waypoints: [MESKEL, KAZANCHIS] };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ role: "admin", operatorCode: null });
  prisma.route.findUnique.mockResolvedValue({ id: "route-1" });
  prisma.trip.findMany.mockResolvedValue([{ shapeId: "shape-1" }]);
  prisma.shape.findUnique.mockResolvedValue({ geojson: { type: "LineString" } });
  prisma.shapeOverride.findUnique.mockResolvedValue(null);
  prisma.shapeOverride.upsert.mockResolvedValue({});
  prisma.shape.updateMany.mockResolvedValue({ count: 1 });
  // Direction 0 also repoints Route.geojson — the rider map draws that one.
  prisma.route.update.mockResolvedValue({});
  snapWaypoints.mockResolvedValue({
    coordinates: LINE,
    segments: [{ coordinates: LINE, straightLine: false }],
    unsnappedCount: 0,
  });
});

describe("saveRouteShape", () => {
  it("saves the line and reports how much of it snapped", async () => {
    const result = await saveRouteShape(input);

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.unsnappedCount).toBe(0);
    expect(prisma.shapeOverride.upsert).toHaveBeenCalled();
  });

  it("re-snaps server-side instead of trusting the browser's geometry", async () => {
    await saveRouteShape(input);

    // A client-supplied LineString would let anyone with the permission write
    // arbitrary geometry into the published feed.
    expect(snapWaypoints).toHaveBeenCalledWith([MESKEL, KAZANCHIS]);
  });

  it("refuses a direction with no trips instead of saving into the void", async () => {
    prisma.trip.findMany.mockResolvedValue([]);

    const result = await saveRouteShape(input);

    // The console map draws trips that carry a shapeId, so with no trips the
    // drawing would be stored and never appear. Returning ok here would tell
    // the operator "saved" over an unchanged map.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("no trips");
    expect(prisma.shapeOverride.upsert).not.toHaveBeenCalled();
  });

  it("refuses an unknown route", async () => {
    prisma.route.findUnique.mockResolvedValue(null);

    const result = await saveRouteShape(input);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Route not found");
  });

  it("refuses waypoints outside Addis", async () => {
    const result = await saveRouteShape({
      ...input,
      waypoints: [MESKEL, { lat: 51.5, lon: -0.12 }],
    });

    expect(result.ok).toBe(false);
    expect(prisma.shapeOverride.upsert).not.toHaveBeenCalled();
  });

  it("refuses a single waypoint — a line needs two", async () => {
    const result = await saveRouteShape({ ...input, waypoints: [MESKEL] });

    expect(result.ok).toBe(false);
  });

  it("refuses when snapping produces too few points to be a line", async () => {
    snapWaypoints.mockResolvedValue({
      coordinates: [[38.76, 9.01]],
      segments: [],
      unsnappedCount: 0,
    });

    const result = await saveRouteShape(input);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Could not build a line");
  });

  it("captures the feed's geometry on the first edit only", async () => {
    await saveRouteShape(input);

    expect(prisma.shapeOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ baseGeojson: expect.anything() }),
      }),
    );
  });

  it("does not re-capture a base on a second edit", async () => {
    prisma.shapeOverride.findUnique.mockResolvedValue({ routeId: "route-1" });

    await saveRouteShape(input);

    // Re-capturing would record the FIRST drawing as "the feed", so reset would
    // restore a previous edit rather than the original line.
    const call = prisma.shapeOverride.upsert.mock.calls[0][0];
    expect(call.create.baseGeojson).toBeUndefined();
    expect(call.update.baseGeojson).toBeUndefined();
  });

  it("returns an error rather than throwing when the write fails", async () => {
    prisma.shapeOverride.upsert.mockRejectedValue(new Error("deadlock"));

    const result = await saveRouteShape(input);

    // Server Actions must never throw across the boundary (CLAUDE.md §7).
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Couldn't save the shape");
  });

  it("passes the unsnapped count through so the operator is told", async () => {
    snapWaypoints.mockResolvedValue({
      coordinates: LINE,
      segments: [
        { coordinates: LINE, straightLine: true },
        { coordinates: LINE, straightLine: false },
      ],
      unsnappedCount: 1,
    });

    const result = await saveRouteShape(input);

    expect(result.ok && result.data.unsnappedCount).toBe(1);
  });
});

describe("resetRouteShape", () => {
  const reset = { routeId: "route-1", directionId: 0 };

  it("restores the captured feed geometry and drops the override", async () => {
    prisma.shapeOverride.findUnique.mockResolvedValue({
      baseGeojson: { type: "LineString", coordinates: LINE },
    });
    prisma.shapeOverride.delete.mockResolvedValue({});

    const result = await resetRouteShape(reset);

    expect(result.ok).toBe(true);
    expect(prisma.shapeOverride.delete).toHaveBeenCalled();
    expect(prisma.shape.updateMany).toHaveBeenCalled();
  });

  it("refuses when the direction was never drawn", async () => {
    prisma.shapeOverride.findUnique.mockResolvedValue(null);

    const result = await resetRouteShape(reset);

    expect(result.ok).toBe(false);
    expect(prisma.shapeOverride.delete).not.toHaveBeenCalled();
  });

  it("says so when the original geometry was never captured", async () => {
    // Rows written before baseGeojson existed can't be reset — better to name
    // that than to delete the override and leave the drawing on the map.
    prisma.shapeOverride.findUnique.mockResolvedValue({ baseGeojson: null });

    const result = await resetRouteShape(reset);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("reseed");
    expect(prisma.shapeOverride.delete).not.toHaveBeenCalled();
  });

  it("returns an error rather than throwing when the delete fails", async () => {
    prisma.shapeOverride.findUnique.mockResolvedValue({
      baseGeojson: { type: "LineString", coordinates: LINE },
    });
    prisma.shapeOverride.delete.mockRejectedValue(new Error("deadlock"));

    const result = await resetRouteShape(reset);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Couldn't reset the shape");
  });
});
