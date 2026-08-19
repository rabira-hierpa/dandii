import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trip field edits, against stubbed persistence.
 *
 * block_id is not a column the DT4A feed has, which is exactly why the override
 * matters: nothing would reconstruct it after a reseed. It also has no Trip
 * column, so unlike headsign it must NOT be mirrored — it reaches riders only
 * through the regenerated feed.
 */

const prisma = vi.hoisted(() => ({
  trip: { findUnique: vi.fn(), update: vi.fn() },
  tripOverride: { upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateTripFields } = await import("./trip-edit");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.trip.findUnique.mockResolvedValue({ id: "trip-1" });
  prisma.trip.update.mockResolvedValue({});
  prisma.tripOverride.upsert.mockResolvedValue({});
});

describe("updateTripFields", () => {
  it("stores a block id as an override", async () => {
    const result = await updateTripFields({ tripId: "trip-1", blockId: "B12" });

    expect(result.ok).toBe(true);
    expect(prisma.tripOverride.upsert).toHaveBeenCalled();
  });

  it("does NOT mirror block id onto the Trip row — there is no column", async () => {
    await updateTripFields({ tripId: "trip-1", blockId: "B12" });

    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it("mirrors headsign, which doubles as the direction label", async () => {
    await updateTripFields({ tripId: "trip-1", headsign: "Megenagna" });

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { headsign: "Megenagna" } }),
    );
  });

  it("does not mirror a cleared headsign", async () => {
    // Null clears the override so the feed value returns; only a reseed can
    // actually restore it, so leave the Trip row alone.
    await updateTripFields({ tripId: "trip-1", headsign: null });

    expect(prisma.tripOverride.upsert).toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it("refuses an unknown trip", async () => {
    prisma.trip.findUnique.mockResolvedValue(null);

    const result = await updateTripFields({ tripId: "nope", blockId: "B1" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Trip not found");
    expect(prisma.tripOverride.upsert).not.toHaveBeenCalled();
  });

  it("rejects an empty trip id", async () => {
    const result = await updateTripFields({ tripId: "", blockId: "B1" });

    expect(result.ok).toBe(false);
    expect(prisma.trip.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an over-long block id", async () => {
    const result = await updateTripFields({
      tripId: "trip-1",
      blockId: "x".repeat(65),
    });

    expect(result.ok).toBe(false);
    expect(prisma.tripOverride.upsert).not.toHaveBeenCalled();
  });
});
