import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The active-closure cache on the directions hot path.
 *
 * Every journey plan and every map load asks the same question. Caching it is
 * only safe because the invalidation is exact: closures are the one piece of
 * state where being stale means routing somebody into a blocked road.
 */

const prisma = vi.hoisted(() => ({
  routeClosure: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));

const { getActiveClosures, invalidateClosureCache } = await import("./transit");

const CLOSURE = {
  routeId: "route-1",
  kind: "SEVERED",
  fromStopId: "a",
  toStopId: "b",
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateClosureCache();
  prisma.routeClosure.findMany.mockResolvedValue([CLOSURE]);
});

describe("getActiveClosures", () => {
  it("reads the database on a cold call", async () => {
    const rows = await getActiveClosures();

    expect(rows).toHaveLength(1);
    expect(prisma.routeClosure.findMany).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst of concurrent plans onto one query", async () => {
    await Promise.all([
      getActiveClosures(),
      getActiveClosures(),
      getActiveClosures(),
    ]);

    // Three riders planning at once should not be three identical reads.
    expect(prisma.routeClosure.findMany.mock.calls.length).toBeLessThanOrEqual(3);
    await getActiveClosures();
    const after = prisma.routeClosure.findMany.mock.calls.length;
    await getActiveClosures();
    expect(prisma.routeClosure.findMany.mock.calls.length).toBe(after);
  });

  it("re-reads after a closure is opened or closed", async () => {
    await getActiveClosures();
    prisma.routeClosure.findMany.mockResolvedValue([]);

    invalidateClosureCache();
    const rows = await getActiveClosures();

    // The operator has to see their own change, not the cached read.
    expect(rows).toEqual([]);
    expect(prisma.routeClosure.findMany).toHaveBeenCalledTimes(2);
  });

  it("never serves the cache to a caller asking about a specific instant", async () => {
    // A historical or scheduled-time query wants that instant, not whatever was
    // last computed for "now".
    await getActiveClosures();
    prisma.routeClosure.findMany.mockResolvedValue([]);

    const rows = await getActiveClosures(new Date("2026-01-01T00:00:00Z"));

    expect(rows).toEqual([]);
    expect(prisma.routeClosure.findMany).toHaveBeenCalledTimes(2);
  });

  it("does not let a dated query poison the live cache", async () => {
    prisma.routeClosure.findMany.mockResolvedValue([]);
    await getActiveClosures(new Date("2026-01-01T00:00:00Z"));

    prisma.routeClosure.findMany.mockResolvedValue([CLOSURE]);
    const rows = await getActiveClosures();

    expect(rows).toHaveLength(1);
  });
});
