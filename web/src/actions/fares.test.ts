import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fare writes, scoped to the operator that runs the route.
 *
 * A fare is the most rider-visible number in the product: it shows on the
 * route sheet and ships in the published feed. Before this, any route-operator
 * could set or clear one on any operator's route.
 */

const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  routeAssignment: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const applyFareChange = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/fare-write", () => ({ applyFareChange }));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(() => Promise.resolve({ user: { id: "user-1" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateFare, bulkSetFare } = await import("./fares");

const FLAT = { kind: "FLAT" as const, flatAmountEtb: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ role: "admin", operatorCode: null });
  prisma.$transaction.mockImplementation(
    async (fn: (t: unknown) => unknown) => fn({}),
  );
  applyFareChange.mockResolvedValue(undefined);
});

function anbessaDispatcher() {
  prisma.user.findUnique.mockResolvedValue({
    role: "route-operator",
    operatorCode: "ANBESSA",
  });
}

describe("updateFare", () => {
  it("refuses another operator's route", async () => {
    anbessaDispatcher();
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r1", operator: { code: "LRT" } },
    ]);

    const result = await updateFare({ routeId: "r1", ...FLAT });

    expect(result.ok).toBe(false);
    expect(applyFareChange).not.toHaveBeenCalled();
  });

  it("allows their own route", async () => {
    anbessaDispatcher();
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r1", operator: { code: "ANBESSA" } },
    ]);

    const result = await updateFare({ routeId: "r1", ...FLAT });

    expect(result.ok).toBe(true);
    expect(applyFareChange).toHaveBeenCalled();
  });

  it("leaves an admin unscoped", async () => {
    const result = await updateFare({ routeId: "r1", ...FLAT });

    expect(result.ok).toBe(true);
    expect(prisma.routeAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe("bulkSetFare", () => {
  it("refuses the whole batch when one route is foreign", async () => {
    // All or nothing: a partial write would report a count the operator
    // cannot reconcile against what they selected.
    anbessaDispatcher();
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r1", operator: { code: "ANBESSA" } },
      { routeId: "r2", operator: { code: "SHEGER" } },
    ]);

    const result = await bulkSetFare({ routeIds: ["r1", "r2"], ...FLAT });

    expect(result.ok).toBe(false);
    expect(applyFareChange).not.toHaveBeenCalled();
  });

  it("applies a batch that is entirely theirs", async () => {
    anbessaDispatcher();
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r1", operator: { code: "ANBESSA" } },
      { routeId: "r2", operator: { code: "ANBESSA" } },
    ]);

    const result = await bulkSetFare({ routeIds: ["r1", "r2"], ...FLAT });

    expect(result.ok).toBe(true);
    expect(applyFareChange).toHaveBeenCalledTimes(2);
  });

  it("refuses a batch containing an unassigned route", async () => {
    anbessaDispatcher();
    prisma.routeAssignment.findMany.mockResolvedValue([
      { routeId: "r1", operator: { code: "ANBESSA" } },
    ]);

    const result = await bulkSetFare({ routeIds: ["r1", "orphan"], ...FLAT });

    expect(result.ok).toBe(false);
  });
});
