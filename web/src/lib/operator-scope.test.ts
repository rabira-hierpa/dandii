import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-operator authorization.
 *
 * The rule these cover is the one the invitation UI promises: someone invited
 * to run Anbessa's routes can edit Anbessa's routes and nothing else. Each
 * case is written from the direction that matters — what a scoped user is
 * refused — because the failure mode of this module is silently allowing.
 */

const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  routeAssignment: { findMany: vi.fn() },
  stopTime: { findMany: vi.fn() },
  trip: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));

const {
  assertRouteInScope,
  assertStopInScope,
  assertTripInScope,
  denyOutOfScope,
  getUserOperatorCode,
  OperatorScopeError,
  resolveCreateOperator,
} = await import("./operator-scope");

/** A user pinned to one operator. */
function scopedTo(code: string) {
  prisma.user.findUnique.mockResolvedValue({
    role: "route-operator",
    operatorCode: code,
  });
}

/** An admin: no operator, edits anything. */
function networkWide() {
  prisma.user.findUnique.mockResolvedValue({
    role: "admin",
    operatorCode: null,
  });
}

function assignments(map: Record<string, string>) {
  prisma.routeAssignment.findMany.mockImplementation(
    ({ where }: { where: { routeId: { in: string[] } } }) =>
      Promise.resolve(
        where.routeId.in
          .filter((id) => map[id])
          .map((id) => ({ routeId: id, operator: { code: map[id] } })),
      ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  networkWide();
  assignments({});
  prisma.stopTime.findMany.mockResolvedValue([]);
  prisma.trip.findUnique.mockResolvedValue(null);
});

describe("getUserOperatorCode", () => {
  it("returns null for a network-wide role", async () => {
    expect(await getUserOperatorCode("u1")).toBeNull();
  });

  it("returns the code for a scoped role", async () => {
    scopedTo("ANBESSA");
    expect(await getUserOperatorCode("u1")).toBe("ANBESSA");
  });

  it("refuses an unknown user rather than treating it as unscoped", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(getUserOperatorCode("ghost")).rejects.toThrow(
      OperatorScopeError,
    );
  });

  it("refuses a route-operator whose operator was never set", async () => {
    // How this arises: a demotion through better-auth's own setRole, which
    // does not know about operatorCode. Fails closed, so the stale role
    // blocks edits instead of widening them to the whole network.
    prisma.user.findUnique.mockResolvedValue({
      role: "route-operator",
      operatorCode: null,
    });
    await expect(getUserOperatorCode("u1")).rejects.toThrow(
      /no operator assigned/,
    );
  });
});

describe("assertRouteInScope", () => {
  it("lets an admin edit another operator's route", async () => {
    assignments({ r1: "LRT" });
    await expect(assertRouteInScope("u1", "r1")).resolves.toBeUndefined();
  });

  it("lets a scoped user edit their own route", async () => {
    scopedTo("ANBESSA");
    assignments({ r1: "ANBESSA" });
    await expect(assertRouteInScope("u1", "r1")).resolves.toBeUndefined();
  });

  it("refuses a scoped user another operator's route, and names the owner", async () => {
    scopedTo("ANBESSA");
    assignments({ r1: "LRT" });
    await expect(assertRouteInScope("u1", "r1")).rejects.toThrow(
      /belongs to LRT, not ANBESSA/,
    );
  });

  it("refuses an unassigned route — nobody owning it is not everybody", async () => {
    scopedTo("ANBESSA");
    assignments({});
    await expect(assertRouteInScope("u1", "r1")).rejects.toThrow(
      /not assigned to any operator/,
    );
  });

  it("refuses a batch where a single route is foreign", async () => {
    scopedTo("SHEGER");
    assignments({ r1: "SHEGER", r2: "SHEGER", r3: "MINIBUS" });
    const { assertRoutesInScope } = await import("./operator-scope");
    await expect(
      assertRoutesInScope("u1", ["r1", "r2", "r3"]),
    ).rejects.toThrow(/r3/);
  });

  it("does not query at all for an empty batch", async () => {
    const { assertRoutesInScope } = await import("./operator-scope");
    await assertRoutesInScope("u1", []);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("assertStopInScope", () => {
  it("allows a stop only this operator's routes serve", async () => {
    scopedTo("ANBESSA");
    prisma.stopTime.findMany.mockResolvedValue([
      { trip: { routeId: "r1" } },
      { trip: { routeId: "r2" } },
    ]);
    assignments({ r1: "ANBESSA", r2: "ANBESSA" });
    await expect(assertStopInScope("u1", "s1")).resolves.toBeUndefined();
  });

  it("refuses an interchange another operator also calls at", async () => {
    // Renaming Megenagna changes it for everyone whose line stops there, so a
    // shared stop stays with the admins.
    scopedTo("ANBESSA");
    prisma.stopTime.findMany.mockResolvedValue([
      { trip: { routeId: "r1" } },
      { trip: { routeId: "r9" } },
    ]);
    assignments({ r1: "ANBESSA", r9: "LRT" });
    await expect(assertStopInScope("u1", "s1")).rejects.toThrow(/LRT/);
  });

  it("allows a stop no route serves yet", async () => {
    scopedTo("ANBESSA");
    prisma.stopTime.findMany.mockResolvedValue([]);
    await expect(assertStopInScope("u1", "s1")).resolves.toBeUndefined();
  });

  it("skips the lookup entirely for an admin", async () => {
    await assertStopInScope("u1", "s1");
    expect(prisma.stopTime.findMany).not.toHaveBeenCalled();
  });
});

describe("assertTripInScope", () => {
  it("resolves the trip's route and allows a match", async () => {
    scopedTo("SHEGER");
    prisma.trip.findUnique.mockResolvedValue({ routeId: "r1" });
    assignments({ r1: "SHEGER" });
    await expect(assertTripInScope("u1", "t1")).resolves.toBeUndefined();
  });

  it("refuses a trip on another operator's route", async () => {
    scopedTo("SHEGER");
    prisma.trip.findUnique.mockResolvedValue({ routeId: "r1" });
    assignments({ r1: "ANBESSA" });
    await expect(assertTripInScope("u1", "t1")).rejects.toThrow(/ANBESSA/);
  });

  it("refuses an unknown trip", async () => {
    scopedTo("SHEGER");
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(assertTripInScope("u1", "t1")).rejects.toThrow(/unknown trip/);
  });
});

describe("denyOutOfScope", () => {
  it("returns null when the edit is allowed", async () => {
    scopedTo("ANBESSA");
    assignments({ r1: "ANBESSA" });
    expect(await denyOutOfScope("u1", { routeId: "r1" })).toBeNull();
  });

  it("returns an action-shaped error instead of throwing", async () => {
    scopedTo("ANBESSA");
    assignments({ r1: "LRT" });
    const denied = await denyOutOfScope("u1", { routeId: "r1" });
    expect(denied).toEqual({
      ok: false,
      error: expect.stringContaining("belongs to LRT"),
    });
    // The client never sees the internal "Forbidden:" prefix.
    expect(denied?.error).not.toMatch(/^Forbidden/);
  });

  it("lets an unrelated database failure through rather than reading it as a denial", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("connection lost"));
    await expect(denyOutOfScope("u1", { routeId: "r1" })).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("resolveCreateOperator", () => {
  it("forces a scoped user's own operator over what the client asked for", async () => {
    scopedTo("ANBESSA");
    expect(await resolveCreateOperator("u1", "LRT")).toBe("ANBESSA");
  });

  it("passes an admin's choice through", async () => {
    expect(await resolveCreateOperator("u1", "LRT")).toBe("LRT");
  });
});
