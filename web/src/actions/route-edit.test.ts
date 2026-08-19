import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route mutations, against stubbed persistence.
 *
 * The load-bearing behaviour here is the override/tombstone split: an edit is
 * written as a RouteOverride so a reseed replays it, and deleting a FEED route
 * leaves a tombstone because deleting the row outright is a lie the next reseed
 * undoes. An operator-created route has no feed row behind it, so it really goes.
 */

const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  route: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  routeOverride: { upsert: vi.fn(), deleteMany: vi.fn() },
  routeAssignment: { upsert: vi.fn(), findMany: vi.fn() },
  operator: { findUnique: vi.fn() },
  agency: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createRoute, deleteRoute, duplicateRoute, updateRouteFields } =
  await import("./route-edit");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ role: "admin", operatorCode: null });
  prisma.route.findUnique.mockResolvedValue({ id: "route-1", origin: "FEED" });
  prisma.route.create.mockResolvedValue({});
  prisma.route.update.mockResolvedValue({});
  prisma.route.delete.mockResolvedValue({});
  prisma.routeOverride.upsert.mockResolvedValue({});
  prisma.routeOverride.deleteMany.mockResolvedValue({ count: 0 });
  prisma.routeAssignment.upsert.mockResolvedValue({});
  prisma.operator.findUnique.mockResolvedValue({ id: "op-1" });
  prisma.agency.findFirst.mockResolvedValue({ id: "AA" });
});

describe("updateRouteFields", () => {
  it("writes an override rather than only touching the Route row", async () => {
    const result = await updateRouteFields({
      routeId: "route-1",
      shortName: "A24",
    });

    // The override is what survives a reseed; the Route row is just a mirror.
    expect(result.ok).toBe(true);
    expect(prisma.routeOverride.upsert).toHaveBeenCalled();
  });

  it("mirrors onto the Route row so the map reflects the edit before publish", async () => {
    await updateRouteFields({ routeId: "route-1", longName: "Mexico ↔ Megenagna" });

    expect(prisma.route.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ longName: "Mexico ↔ Megenagna" }),
      }),
    );
  });

  it("does not touch the Route row for export-only fields", async () => {
    // desc/url/continuous_* have no Route column — they reach riders only
    // through the regenerated feed, so mirroring them would be a no-op write.
    await updateRouteFields({ routeId: "route-1", desc: "Runs via Bole Road" });

    expect(prisma.routeOverride.upsert).toHaveBeenCalled();
    expect(prisma.route.update).not.toHaveBeenCalled();
  });

  it("reassigns the operator when the code changes", async () => {
    await updateRouteFields({ routeId: "route-1", operatorCode: "ANBESSA" });

    expect(prisma.routeAssignment.upsert).toHaveBeenCalled();
  });

  it("leaves the assignment alone when the operator code is unknown", async () => {
    prisma.operator.findUnique.mockResolvedValue(null);

    const result = await updateRouteFields({
      routeId: "route-1",
      operatorCode: "ANBESSA",
    });

    expect(result.ok).toBe(true);
    expect(prisma.routeAssignment.upsert).not.toHaveBeenCalled();
  });

  it("refuses an unknown route", async () => {
    prisma.route.findUnique.mockResolvedValue(null);

    const result = await updateRouteFields({ routeId: "nope", shortName: "X" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Route not found");
    expect(prisma.routeOverride.upsert).not.toHaveBeenCalled();
  });

  it("rejects a colour that isn't 6-digit hex", async () => {
    const result = await updateRouteFields({ routeId: "route-1", color: "#fff" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("6-digit hex");
  });

  it("rejects a route type GTFS doesn't define", async () => {
    const result = await updateRouteFields({ routeId: "route-1", type: 99 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Unknown route type");
  });
});

describe("createRoute", () => {
  const input = {
    shortName: "OP1",
    longName: "Test corridor",
    type: 3,
    operatorCode: "ANBESSA" as const,
  };

  it("marks the route OPERATOR so a reseed keeps it", async () => {
    const result = await createRoute(input);

    expect(result.ok).toBe(true);
    expect(prisma.route.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ origin: "OPERATOR" }),
      }),
    );
  });

  it("gives the route an op: id that cannot collide with a feed id", async () => {
    await createRoute(input);

    // Feed ids are bare numerics for routes; the prefix keeps a future DT4A
    // revision from reusing an id we already handed out.
    const created = prisma.route.create.mock.calls[0][0];
    expect(created.data.id).toMatch(/^op:/);
  });

  it("refuses an unknown operator", async () => {
    prisma.operator.findUnique.mockResolvedValue(null);

    const result = await createRoute(input);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Unknown operator");
    expect(prisma.route.create).not.toHaveBeenCalled();
  });

  it("refuses when there is no agency to attach to", async () => {
    // agency_id has to name a real agency or the exported feed fails validation.
    prisma.agency.findFirst.mockResolvedValue(null);

    const result = await createRoute(input);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("No agency to attach to");
    expect(prisma.route.create).not.toHaveBeenCalled();
  });

  it("rejects a blank short name", async () => {
    const result = await createRoute({ ...input, shortName: "   " });

    expect(result.ok).toBe(false);
    expect(prisma.route.create).not.toHaveBeenCalled();
  });
});

describe("duplicateRoute", () => {
  beforeEach(() => {
    prisma.route.findUnique.mockResolvedValue({
      shortName: "A24",
      longName: "Mexico ↔ Megenagna",
      type: 3,
      color: "1779c2",
      textColor: "ffffff",
      agencyId: "AA",
      assignment: { operatorId: "op-1" },
    });
  });

  it("copies metadata into a new operator-owned route", async () => {
    const result = await duplicateRoute({ routeId: "route-1" });

    expect(result.ok).toBe(true);
    const created = prisma.route.create.mock.calls[0][0];
    expect(created.data.origin).toBe("OPERATOR");
    expect(created.data.shortName).toBe("A24 (copy)");
    expect(created.data.longName).toBe("Mexico ↔ Megenagna");
  });

  it("does NOT copy trips, stop_times, or shapes", async () => {
    await duplicateRoute({ routeId: "route-1" });

    // A duplicate is "same corridor, different service pattern". Cloning 9,000
    // stop_times would make it look complete when nobody has checked it.
    const created = prisma.route.create.mock.calls[0][0];
    expect(created.data.trips).toBeUndefined();
    expect(created.data.shapes).toBeUndefined();
  });

  it("carries the operator assignment across when the source has one", async () => {
    await duplicateRoute({ routeId: "route-1" });

    const created = prisma.route.create.mock.calls[0][0];
    expect(created.data.assignment).toEqual({ create: { operatorId: "op-1" } });
  });

  it("omits the assignment when the source is unassigned", async () => {
    prisma.route.findUnique.mockResolvedValue({
      shortName: "A24",
      longName: "L",
      type: 3,
      color: null,
      textColor: null,
      agencyId: "AA",
      assignment: null,
    });

    await duplicateRoute({ routeId: "route-1" });

    expect(prisma.route.create.mock.calls[0][0].data.assignment).toBeUndefined();
  });

  it("refuses an unknown route", async () => {
    prisma.route.findUnique.mockResolvedValue(null);

    const result = await duplicateRoute({ routeId: "nope" });

    expect(result.ok).toBe(false);
    expect(prisma.route.create).not.toHaveBeenCalled();
  });
});

describe("deleteRoute", () => {
  it("tombstones a FEED route so the next reseed does not resurrect it", async () => {
    prisma.route.findUnique.mockResolvedValue({ id: "route-1", origin: "FEED" });

    const result = await deleteRoute({ routeId: "route-1" });

    expect(result.ok).toBe(true);
    const upsert = prisma.routeOverride.upsert.mock.calls[0][0];
    expect(upsert.create.deletedAt).toBeInstanceOf(Date);
    expect(prisma.route.delete).toHaveBeenCalled();
  });

  it("really deletes an OPERATOR route — nothing would bring it back", async () => {
    prisma.route.findUnique.mockResolvedValue({
      id: "op:1",
      origin: "OPERATOR",
    });

    const result = await deleteRoute({ routeId: "op:1" });

    expect(result.ok).toBe(true);
    expect(prisma.routeOverride.deleteMany).toHaveBeenCalled();
    expect(prisma.routeOverride.upsert).not.toHaveBeenCalled();
    expect(prisma.route.delete).toHaveBeenCalled();
  });

  it("refuses an unknown route", async () => {
    prisma.route.findUnique.mockResolvedValue(null);

    const result = await deleteRoute({ routeId: "nope" });

    expect(result.ok).toBe(false);
    expect(prisma.route.delete).not.toHaveBeenCalled();
  });

  it("rejects an empty route id", async () => {
    const result = await deleteRoute({ routeId: "" });

    expect(result.ok).toBe(false);
    expect(prisma.route.findUnique).not.toHaveBeenCalled();
  });
});

describe("operator scope", () => {
  /** A dispatcher invited to run Anbessa, looking at an LRT route. */
  function anbessaUserEditingLrtRoute() {
    prisma.user.findUnique.mockResolvedValue({
      role: "route-operator",
      operatorCode: "ANBESSA",
    });
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "route-1", operator: { code: "LRT" } },
    ]);
  }

  it("refuses to edit a route belonging to another operator", async () => {
    anbessaUserEditingLrtRoute();
    const result = await updateRouteFields({
      routeId: "route-1",
      shortName: "hijacked",
    });

    expect(result.ok).toBe(false);
    expect(prisma.routeOverride.upsert).not.toHaveBeenCalled();
  });

  it("refuses to delete another operator's route", async () => {
    anbessaUserEditingLrtRoute();
    const result = await deleteRoute({ routeId: "route-1" });

    expect(result.ok).toBe(false);
    expect(prisma.route.delete).not.toHaveBeenCalled();
    expect(prisma.route.update).not.toHaveBeenCalled();
  });

  it("refuses to duplicate another operator's route", async () => {
    anbessaUserEditingLrtRoute();
    const result = await duplicateRoute({ routeId: "route-1" });

    expect(result.ok).toBe(false);
    expect(prisma.route.create).not.toHaveBeenCalled();
  });

  it("refuses to file a new route under someone else's operator", async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: "route-operator",
      operatorCode: "ANBESSA",
    });
    const result = await createRoute({
      shortName: "L9",
      longName: "Somewhere",
      type: 0,
      operatorCode: "LRT",
    });

    expect(result.ok).toBe(false);
    expect(prisma.route.create).not.toHaveBeenCalled();
  });

  it("still lets that dispatcher edit their own operator's route", async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: "route-operator",
      operatorCode: "ANBESSA",
    });
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "route-1", operator: { code: "ANBESSA" } },
    ]);
    const result = await updateRouteFields({
      routeId: "route-1",
      shortName: "A1",
    });

    expect(result.ok).toBe(true);
    expect(prisma.routeOverride.upsert).toHaveBeenCalled();
  });
});
