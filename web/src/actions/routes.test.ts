import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route creation from the console routes table.
 *
 * This is a second `createRoute` alongside the one in `route-edit.ts`, kept
 * because the two carry different permissions (`route:create` vs
 * `feedEdit:edit`) and different id schemes. Consolidating them is tracked in
 * TODOS.md; until then both must mark what they create as operator-authored.
 */

const prisma = vi.hoisted(() => ({
  route: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  agency: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createRoute } = await import("./routes");

const input = {
  shortName: "A25",
  longName: "Test corridor",
  // GTFS route_type: the schema accepts 0 (LRT) and 3 (bus), the two the feed uses.
  type: 3 as const,
  lengthKm: null,
  operatorId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.agency.findFirst.mockResolvedValue({ id: "AA" });
  prisma.route.create.mockResolvedValue({ id: "manual-1" });
});

describe("createRoute", () => {
  it("marks the route operator-authored so it reaches the exported feed", async () => {
    // The regression: `origin` defaults to FEED and the exporter only collects
    // created routes with `origin: OPERATOR`. Without this a route added in the
    // console showed on the map, then vanished on publish with nothing said.
    await createRoute(input);

    expect(prisma.route.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ origin: "OPERATOR" }),
      }),
    );
  });

  it("refuses when there is no agency to attach to", async () => {
    // agency_id must name a real agency or the exported feed fails validation.
    prisma.agency.findFirst.mockResolvedValue(null);

    const result = await createRoute(input);

    expect(result.ok).toBe(false);
    expect(prisma.route.create).not.toHaveBeenCalled();
  });

  it("converts length from km to metres", async () => {
    await createRoute({ ...input, lengthKm: 12.5 });

    expect(prisma.route.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lengthMeters: 12500 }),
      }),
    );
  });

  it("leaves length null when it wasn't given", async () => {
    await createRoute(input);

    const created = prisma.route.create.mock.calls[0][0];
    expect(created.data.lengthMeters).toBeNull();
  });

  it("rejects a blank route id", async () => {
    await expect(createRoute({ ...input, shortName: "  " })).rejects.toThrow();
    expect(prisma.route.create).not.toHaveBeenCalled();
  });
});
