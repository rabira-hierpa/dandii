import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Closure creation, against stubbed persistence.
 *
 * Two rules carry weight. Maintainers are restricted to maintenance-shaped
 * reasons, so an ops account cannot declare a political closure. And a partial
 * closure's stop range is normalized into trip order — an operator who picks the
 * two ends in the wrong order gets the range they meant, not an empty one.
 */

const session = vi.hoisted(() => ({
  current: { user: { id: "user-1", role: "super-admin" } },
}));
const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  trip: { findFirst: vi.fn() },
  routeClosure: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(() => Promise.resolve(session.current)),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createClosure, endClosure } = await import("./closures");

/** Closure windows must be in the future — the schema rejects past dates. */
const soon = () => new Date(Date.now() + 60 * 60 * 1000);
const later = () => new Date(Date.now() + 4 * 60 * 60 * 1000);

const whole = () => ({
  routeId: "route-1",
  reason: "OTHER" as const,
  startsAt: soon(),
  endsAt: later(),
  kind: "WHOLE_ROUTE" as const,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ role: "admin", operatorCode: null });
  session.current = { user: { id: "user-1", role: "super-admin" } };
  prisma.routeClosure.create.mockResolvedValue({});
  prisma.routeClosure.findUnique.mockResolvedValue({ id: "c1" });
  prisma.routeClosure.update.mockResolvedValue({});
  prisma.trip.findFirst.mockResolvedValue({
    stopTimes: [{ stopId: "a" }, { stopId: "b" }, { stopId: "c" }, { stopId: "d" }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createClosure", () => {
  it("creates a whole-route closure", async () => {
    const result = await createClosure(whole());

    expect(result.ok).toBe(true);
    expect(prisma.routeClosure.create).toHaveBeenCalled();
  });

  it("leaves the stop range null for a whole-route closure", async () => {
    await createClosure(whole());

    const created = prisma.routeClosure.create.mock.calls[0][0];
    expect(created.data.fromStopId).toBeNull();
    expect(created.data.toStopId).toBeNull();
  });

  it("normalizes a reversed stop range into trip order", async () => {
    // The operator picked the far end first; they meant b..d, not nothing.
    const result = await createClosure({
      ...whole(),
      kind: "SEVERED",
      fromStopId: "d",
      toStopId: "b",
    });

    expect(result.ok).toBe(true);
    const created = prisma.routeClosure.create.mock.calls[0][0];
    expect(created.data.fromStopId).toBe("b");
    expect(created.data.toStopId).toBe("d");
  });

  it("keeps an already-ordered range as given", async () => {
    await createClosure({
      ...whole(),
      kind: "SKIPPED",
      fromStopId: "b",
      toStopId: "c",
    });

    const created = prisma.routeClosure.create.mock.calls[0][0];
    expect(created.data.fromStopId).toBe("b");
    expect(created.data.toStopId).toBe("c");
  });

  it("refuses a stop that isn't on the route", async () => {
    const result = await createClosure({
      ...whole(),
      kind: "SEVERED",
      fromStopId: "a",
      toStopId: "zzz",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("must be on this route");
    expect(prisma.routeClosure.create).not.toHaveBeenCalled();
  });

  it("refuses a partial closure on a route with no stops", async () => {
    prisma.trip.findFirst.mockResolvedValue(null);

    const result = await createClosure({
      ...whole(),
      kind: "SEVERED",
      fromStopId: "a",
      toStopId: "b",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("no trips/stops");
  });

  it("requires both ends of a partial range", async () => {
    const result = await createClosure({
      ...whole(),
      kind: "SEVERED",
      fromStopId: "a",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("both ends");
    expect(prisma.routeClosure.create).not.toHaveBeenCalled();
  });

  it("stops a maintainer declaring a non-maintenance closure", async () => {
    session.current = { user: { id: "user-2", role: "maintainer" } };

    // POLITICAL_EVENT is a real reason, just not one a maintainer may declare.
    const result = await createClosure({ ...whole(), reason: "POLITICAL_EVENT" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("maintenance or other");
    expect(prisma.routeClosure.create).not.toHaveBeenCalled();
  });

  it("lets a maintainer declare a maintenance closure", async () => {
    session.current = { user: { id: "user-2", role: "maintainer" } };

    const result = await createClosure({ ...whole(), reason: "MAINTENANCE" });

    expect(result.ok).toBe(true);
    expect(prisma.routeClosure.create).toHaveBeenCalled();
  });

  it("rejects an end that precedes the start", async () => {
    const result = await createClosure({
      ...whole(),
      startsAt: later(),
      endsAt: soon(),
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("End must be after start");
  });

  it("rejects a window that already passed", async () => {
    const result = await createClosure({
      ...whole(),
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() - 3_600_000),
    });

    expect(result.ok).toBe(false);
    expect(prisma.routeClosure.create).not.toHaveBeenCalled();
  });

  it("allows a start a few seconds in the past", async () => {
    // One-minute grace so "now" from a slightly-lagged client still validates.
    const result = await createClosure({
      ...whole(),
      startsAt: new Date(Date.now() - 5_000),
    });

    expect(result.ok).toBe(true);
  });

  it("stores an empty note as null rather than an empty string", async () => {
    await createClosure({ ...whole(), note: "" });

    expect(prisma.routeClosure.create.mock.calls[0][0].data.note).toBeNull();
  });
});

describe("endClosure", () => {
  it("reopens the route by ending the closure now", async () => {
    const result = await endClosure("c1");

    expect(result.ok).toBe(true);
    const update = prisma.routeClosure.update.mock.calls[0][0];
    expect(update.data.endsAt).toBeInstanceOf(Date);
  });

  it("refuses an unknown closure", async () => {
    prisma.routeClosure.findUnique.mockResolvedValue(null);

    const result = await endClosure("nope");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Closure not found");
    expect(prisma.routeClosure.update).not.toHaveBeenCalled();
  });
});
