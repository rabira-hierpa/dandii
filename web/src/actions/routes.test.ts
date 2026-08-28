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
  user: { findUnique: vi.fn() },
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
  prisma.user.findUnique.mockResolvedValue({ role: "admin", operatorCode: null });
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

/**
 * Both entry points share one creation core.
 *
 * The permissions differ by design (`route:create` here, `feedEdit:edit` in the
 * network-map editor) and the callers differ, but the row they write must not.
 * They drifted once: only one set `origin`, and routes created through this door
 * were silently absent from every published feed.
 */
describe("shared creation invariants", () => {
  it("gives the route an op: id that cannot collide with a feed id", async () => {
    // Was `manual-…` here and `op:…` in the other action. The feed uses bare
    // numerics for routes, so one prefix is enough and two is a divergence
    // waiting to matter.
    await createRoute(input);

    expect(prisma.route.create.mock.calls[0][0].data.id).toMatch(/^op:/);
  });

  it("always attaches a real agency", async () => {
    await createRoute(input);

    expect(prisma.route.create.mock.calls[0][0].data.agencyId).toBe("AA");
  });

  it("records who made the assignment when an operator is picked", async () => {
    await createRoute({ ...input, operatorId: "op-1" });

    const created = prisma.route.create.mock.calls[0][0];
    expect(created.data.assignment).toEqual({
      create: { operatorId: "op-1", assignedById: "user-1" },
    });
  });

  it("omits the assignment entirely when no operator was picked", async () => {
    await createRoute(input);

    expect(prisma.route.create.mock.calls[0][0].data.assignment).toBeUndefined();
  });
});
