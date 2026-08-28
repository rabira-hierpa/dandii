import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stop mutations, against stubbed persistence.
 *
 * The two behaviours worth guarding: the delete guard (the worst interchange in
 * the feed serves 26 routes, and deleting it would silently shorten all of them)
 * and the reorder contract (times stay with the POSITION, not the stop, or the
 * timetable goes backwards mid-trip and every arrival estimate downstream breaks).
 */

const tx = vi.hoisted(() => ({
  stopTime: { deleteMany: vi.fn(), createMany: vi.fn() },
}));
const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  stop: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  stopOverride: { upsert: vi.fn(), deleteMany: vi.fn() },
  stopTime: { findMany: vi.fn() },
  trip: { findMany: vi.fn(), findFirst: vi.fn() },
  routeStopOrderOverride: { upsert: vi.fn() },
  routeAssignment: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createStop, deleteStop, renameStop, reorderRouteStops, setStopNameAm } =
  await import("./stop-edit");

const MEGENAGNA = { lat: 9.0194, lon: 38.8005 };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ role: "admin", operatorCode: null });
  prisma.stop.findUnique.mockResolvedValue({
    id: "node/1",
    name: "Megenagna",
    origin: "FEED",
  });
  prisma.stop.create.mockResolvedValue({});
  prisma.stop.update.mockResolvedValue({});
  prisma.stop.delete.mockResolvedValue({});
  prisma.stopOverride.upsert.mockResolvedValue({});
  prisma.stopOverride.deleteMany.mockResolvedValue({ count: 0 });
  prisma.stopTime.findMany.mockResolvedValue([]);
  prisma.trip.findMany.mockResolvedValue([]);
  prisma.routeStopOrderOverride.upsert.mockResolvedValue({});
  tx.stopTime.deleteMany.mockResolvedValue({ count: 0 });
  tx.stopTime.createMany.mockResolvedValue({ count: 0 });
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) =>
    fn(tx),
  );
});

describe("renameStop", () => {
  it("writes an override for a FEED stop and mirrors the name", async () => {
    const result = await renameStop({ stopId: "node/1", name: "Megenagna LRT" });

    expect(result.ok).toBe(true);
    expect(prisma.stopOverride.upsert).toHaveBeenCalled();
    expect(prisma.stop.update).toHaveBeenCalled();
  });

  it("edits an OPERATOR stop in place — there is no base row behind it", async () => {
    prisma.stop.findUnique.mockResolvedValue({
      id: "op:1",
      name: "Mine",
      origin: "OPERATOR",
    });

    const result = await renameStop({ stopId: "op:1", name: "Renamed" });

    expect(result.ok).toBe(true);
    expect(prisma.stop.update).toHaveBeenCalled();
    expect(prisma.stopOverride.upsert).not.toHaveBeenCalled();
  });

  it("refuses to clear the name of an OPERATOR stop", async () => {
    // Null means "restore the feed value" — an operator stop has none.
    prisma.stop.findUnique.mockResolvedValue({
      id: "op:1",
      name: "Mine",
      origin: "OPERATOR",
    });

    const result = await renameStop({ stopId: "op:1", name: null });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("This stop needs a name");
    expect(prisma.stop.update).not.toHaveBeenCalled();
  });

  it("clears a FEED override without mirroring — only a reseed restores it", async () => {
    const result = await renameStop({ stopId: "node/1", name: null });

    expect(result.ok).toBe(true);
    expect(prisma.stopOverride.upsert).toHaveBeenCalled();
    expect(prisma.stop.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown stop", async () => {
    prisma.stop.findUnique.mockResolvedValue(null);

    const result = await renameStop({ stopId: "nope", name: "X" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Stop not found");
  });

  it("rejects a blank name", async () => {
    const result = await renameStop({ stopId: "node/1", name: "   " });

    expect(result.ok).toBe(false);
    expect(prisma.stopOverride.upsert).not.toHaveBeenCalled();
  });
});

describe("setStopNameAm", () => {
  it("writes an override for a FEED stop and mirrors nameAm", async () => {
    const result = await setStopNameAm({ stopId: "node/1", nameAm: "መገናኛ" });

    expect(result.ok).toBe(true);
    expect(prisma.stopOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ nameAm: "መገናኛ" }),
      }),
    );
    expect(prisma.stop.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nameAm: "መገናኛ" } }),
    );
  });

  it("edits an OPERATOR stop in place, no override row", async () => {
    prisma.stop.findUnique.mockResolvedValue({
      id: "op:1",
      name: "Mine",
      origin: "OPERATOR",
    });

    const result = await setStopNameAm({ stopId: "op:1", nameAm: "የኔ" });

    expect(result.ok).toBe(true);
    expect(prisma.stop.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nameAm: "የኔ" } }),
    );
    expect(prisma.stopOverride.upsert).not.toHaveBeenCalled();
  });

  it("clears nameAm with null, falling back to the English name", async () => {
    const result = await setStopNameAm({ stopId: "node/1", nameAm: null });

    expect(result.ok).toBe(true);
    expect(prisma.stopOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ nameAm: null }),
      }),
    );
  });

  it("refuses an unknown stop", async () => {
    prisma.stop.findUnique.mockResolvedValue(null);

    const result = await setStopNameAm({ stopId: "nope", nameAm: "X" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Stop not found");
  });
});

describe("createStop", () => {
  it("creates an OPERATOR stop with an op: id", async () => {
    const result = await createStop({ name: "New stop", ...MEGENAGNA });

    expect(result.ok).toBe(true);
    const created = prisma.stop.create.mock.calls[0][0];
    expect(created.data.origin).toBe("OPERATOR");
    expect(created.data.id).toMatch(/^op:/);
  });

  it("rejects coordinates outside Addis", async () => {
    // A typo'd coordinate should not land the stop in Kenya.
    const result = await createStop({ name: "Nairobi", lat: -1.29, lon: 36.82 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("outside Addis");
    expect(prisma.stop.create).not.toHaveBeenCalled();
  });

  it("rejects a blank name", async () => {
    const result = await createStop({ name: "  ", ...MEGENAGNA });

    expect(result.ok).toBe(false);
    expect(prisma.stop.create).not.toHaveBeenCalled();
  });

  it("says plainly when the stop was made but not added to the route", async () => {
    // The stop exists and is usable elsewhere; implying it is on the route
    // when the splice failed would be the silent-failure version of this.
    prisma.trip.findMany.mockResolvedValue([]);

    const result = await createStop({
      name: "Spliced",
      ...MEGENAGNA,
      routeId: "route-1",
      directionId: 0,
      sequence: 3,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.addedToRoute).toBe(false);
  });
});

describe("deleteStop", () => {
  it("refuses a stop served by more than one route", async () => {
    // The delete guard. Cascading through stop_times would silently shorten
    // every other route calling there — a change nobody asked for or would see.
    prisma.stopTime.findMany.mockResolvedValue([
      { trip: { routeId: "route-1" } },
      { trip: { routeId: "route-2" } },
      { trip: { routeId: "route-3" } },
    ]);

    const result = await deleteStop({ stopId: "node/1" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("3 routes");
    expect(prisma.stop.delete).not.toHaveBeenCalled();
  });

  it("allows deleting a stop that only one route serves", async () => {
    prisma.stopTime.findMany.mockResolvedValue([
      { trip: { routeId: "route-1" } },
      { trip: { routeId: "route-1" } },
    ]);

    const result = await deleteStop({ stopId: "node/1" });

    expect(result.ok).toBe(true);
    expect(prisma.stop.delete).toHaveBeenCalled();
  });

  it("tombstones a FEED stop", async () => {
    const result = await deleteStop({ stopId: "node/1" });

    expect(result.ok).toBe(true);
    const upsert = prisma.stopOverride.upsert.mock.calls[0][0];
    expect(upsert.create.deletedAt).toBeInstanceOf(Date);
  });

  it("really deletes an OPERATOR stop", async () => {
    prisma.stop.findUnique.mockResolvedValue({
      id: "op:1",
      name: "Mine",
      origin: "OPERATOR",
    });

    const result = await deleteStop({ stopId: "op:1" });

    expect(result.ok).toBe(true);
    expect(prisma.stopOverride.deleteMany).toHaveBeenCalled();
    expect(prisma.stopOverride.upsert).not.toHaveBeenCalled();
  });

  it("refuses an unknown stop", async () => {
    prisma.stop.findUnique.mockResolvedValue(null);

    const result = await deleteStop({ stopId: "nope" });

    expect(result.ok).toBe(false);
    expect(prisma.stop.delete).not.toHaveBeenCalled();
  });
});

describe("reorderRouteStops", () => {
  const order = ["a", "b", "c"];

  beforeEach(() => {
    prisma.trip.findMany.mockResolvedValue([
      {
        id: "trip-1",
        stopTimes: [
          { stopId: "a", arrival: "06:00", departure: "06:00" },
          { stopId: "b", arrival: "06:10", departure: "06:10" },
          { stopId: "c", arrival: "06:20", departure: "06:20" },
        ],
      },
    ]);
  });

  it("keeps times with the position, not the stop", async () => {
    const result = await reorderRouteStops({
      routeId: "route-1",
      directionId: 0,
      stopIds: ["c", "b", "a"],
    });

    expect(result.ok).toBe(true);
    // Position 1 keeps 06:00 even though the stop there is now "c". Carrying
    // each stop's old time along would produce a timetable that goes backwards.
    const rows = tx.stopTime.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { stopId: string }) => r.stopId)).toEqual(["c", "b", "a"]);
    expect(rows[0].arrival).toBe("06:00");
    expect(rows[2].arrival).toBe("06:20");
  });

  it("clears the rows before rewriting them", async () => {
    // stop_time's PK is (tripId, sequence); updating in place collides the
    // moment two stops swap.
    await reorderRouteStops({ routeId: "route-1", directionId: 0, stopIds: ["b", "a", "c"] });

    expect(tx.stopTime.deleteMany).toHaveBeenCalled();
    expect(tx.stopTime.createMany).toHaveBeenCalled();
  });

  it("numbers sequences from 1", async () => {
    await reorderRouteStops({ routeId: "route-1", directionId: 0, stopIds: order });

    const rows = tx.stopTime.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { sequence: number }) => r.sequence)).toEqual([1, 2, 3]);
  });

  it("rejects a duplicated stop", async () => {
    const result = await reorderRouteStops({
      routeId: "route-1",
      directionId: 0,
      stopIds: ["a", "a", "b"],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("The same stop appears twice");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an order that isn't a permutation of what the trip serves", async () => {
    // A stale client would otherwise silently drop or invent calls.
    const result = await reorderRouteStops({
      routeId: "route-1",
      directionId: 0,
      stopIds: ["a", "b", "z"],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("out of date");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a short order that drops a call", async () => {
    const result = await reorderRouteStops({
      routeId: "route-1",
      directionId: 0,
      stopIds: ["a", "b"],
    });

    expect(result.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a direction with no trips", async () => {
    prisma.trip.findMany.mockResolvedValue([]);

    const result = await reorderRouteStops({
      routeId: "route-1",
      directionId: 1,
      stopIds: order,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("This direction has no trips");
  });

  it("records the order so a reseed replays it", async () => {
    await reorderRouteStops({ routeId: "route-1", directionId: 0, stopIds: ["b", "a", "c"] });

    expect(prisma.routeStopOrderOverride.upsert).toHaveBeenCalled();
  });

  it("rejects fewer than two stops", async () => {
    const result = await reorderRouteStops({
      routeId: "route-1",
      directionId: 0,
      stopIds: ["a"],
    });

    expect(result.ok).toBe(false);
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });
});

describe("operator scope", () => {
  /**
   * The Amharic translation path runs through the same rename permission, so
   * it inherits the same boundary: a dispatcher may name their own line's
   * stops, not a hub that another operator's line also calls at.
   */
  function anbessaDispatcher() {
    prisma.user.findUnique.mockResolvedValue({
      role: "route-operator",
      operatorCode: "ANBESSA",
    });
  }

  it("refuses to translate a stop an LRT line also serves", async () => {
    anbessaDispatcher();
    prisma.stopTime.findMany.mockResolvedValue([
      { trip: { routeId: "r1" } },
      { trip: { routeId: "r9" } },
    ]);
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r1", operator: { code: "ANBESSA" } },
      { routeId: "r9", operator: { code: "LRT" } },
    ]);

    const result = await setStopNameAm({ stopId: "stop-1", nameAm: "መገናኛ" });

    expect(result.ok).toBe(false);
    expect(prisma.stopOverride.upsert).not.toHaveBeenCalled();
  });

  it("allows translating a stop only their own line serves", async () => {
    anbessaDispatcher();
    prisma.stopTime.findMany.mockResolvedValue([{ trip: { routeId: "r1" } }]);
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r1", operator: { code: "ANBESSA" } },
    ]);

    const result = await setStopNameAm({ stopId: "stop-1", nameAm: "ጦር ኃይሎች" });

    expect(result.ok).toBe(true);
  });

  it("refuses to rename another operator's stop", async () => {
    anbessaDispatcher();
    prisma.stopTime.findMany.mockResolvedValue([{ trip: { routeId: "r9" } }]);
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r9", operator: { code: "SHEGER" } },
    ]);

    const result = await renameStop({ stopId: "stop-1", name: "Mine now" });

    expect(result.ok).toBe(false);
  });
});
