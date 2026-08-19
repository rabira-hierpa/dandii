import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guards on fare proposals.
 *
 * Every one of these protects money on a rider's screen, and every one of them
 * is a race or a repeat: the same person submitting twice, two maintainers
 * deciding at once, one approval landing while siblings are still pending. They
 * were built with care and shipped without tests.
 */

const tx = vi.hoisted(() => ({
  fareProposal: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  $executeRaw: vi.fn(),
}));
const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  fareProposal: { count: vi.fn(), findUnique: vi.fn() },
  route: { findUnique: vi.fn() },
  fare: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
const awardPoints = vi.hoisted(() => vi.fn());
const deriveBadges = vi.hoisted(() => vi.fn());
const applyFareChange = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: { user: { id: "reviewer-1" } } as { user: { id: string } } | null,
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(() => Promise.resolve(session.current)),
  requirePermission: vi.fn(() => Promise.resolve(session.current)),
}));
vi.mock("@/lib/points", () => ({
  awardPoints,
  deriveBadges,
  POINTS: {
    SUBMIT: 2,
    APPROVED: 20,
    REJECT_CLAWBACK: -2,
    SUPERSEDED_CREDIT: 10,
  },
}));
vi.mock("@/lib/fare-write", () => ({ applyFareChange }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { RATE_LIMIT_PER_DAY } = await import("./proposal-schema");
const { submitProposal, reviewProposal } = await import("./fare-proposals");
const { Prisma } = await import("@/generated/prisma/client");

const SUBMIT = {
  routeId: "route-1",
  kind: "FLAT" as const,
  flatAmountEtb: 15,
  note: "Fare went up",
};

/** Shaped like the DB row: proposedFlatEtb is a Prisma Decimal. */
const PENDING = {
  id: "prop-1",
  routeId: "route-1",
  submittedById: "rider-1",
  status: "PENDING",
  proposedKind: "FLAT" as const,
  proposedFlatEtb: { toNumber: () => 15 },
  proposedTiers: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ role: "admin", operatorCode: null });
  session.current = { user: { id: "reviewer-1" } };
  prisma.route.findUnique.mockResolvedValue({ id: "route-1" });
  prisma.fare.findUnique.mockResolvedValue(null);
  prisma.fareProposal.count.mockResolvedValue(0);
  prisma.fareProposal.findUnique.mockResolvedValue(PENDING);
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) =>
    fn(tx),
  );
  tx.fareProposal.create.mockResolvedValue({ id: "prop-1" });
  tx.fareProposal.updateMany.mockResolvedValue({ count: 1 });
  tx.fareProposal.findMany.mockResolvedValue([]);
  tx.$executeRaw.mockResolvedValue(1);
  applyFareChange.mockResolvedValue(undefined);
});

describe("submitProposal — rate limit", () => {
  it("accepts a submission under the daily limit", async () => {
    prisma.fareProposal.count.mockResolvedValue(RATE_LIMIT_PER_DAY - 1);

    const result = await submitProposal(SUBMIT);

    expect(result.ok).toBe(true);
  });

  it("refuses once the rolling 24h limit is reached", async () => {
    prisma.fareProposal.count.mockResolvedValue(RATE_LIMIT_PER_DAY);

    const result = await submitProposal(SUBMIT);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("try again tomorrow");
    expect(tx.fareProposal.create).not.toHaveBeenCalled();
  });

  it("counts only this rider's recent submissions", async () => {
    await submitProposal(SUBMIT);

    const where = prisma.fareProposal.count.mock.calls[0][0].where;
    expect(where.submittedById).toBe("reviewer-1");
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("requires a signed-in rider", async () => {
    session.current = null;

    const result = await submitProposal(SUBMIT);

    expect(result.ok).toBe(false);
    expect(prisma.fareProposal.count).not.toHaveBeenCalled();
  });

  it("refuses a route that doesn't exist", async () => {
    prisma.route.findUnique.mockResolvedValue(null);

    const result = await submitProposal(SUBMIT);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Unknown route");
  });
});

describe("submitProposal — one open proposal per route", () => {
  it("turns the unique violation into a sentence a rider can act on", async () => {
    // The partial-unique index is the real guard; this is the translation.
    // Without it a duplicate submit surfaces as a raw Prisma error.
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7",
      }),
    );

    const result = await submitProposal(SUBMIT);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(
      "You already have a pending edit for this route",
    );
  });

  it("does not swallow an unrelated database error", async () => {
    // A deadlock is not "you already submitted", and reporting it as such would
    // hide a real fault behind a friendly message.
    prisma.$transaction.mockRejectedValue(new Error("connection reset"));

    await expect(submitProposal(SUBMIT)).rejects.toThrow("connection reset");
  });
});

describe("reviewProposal — double decision", () => {
  it("refuses a proposal that was already decided", async () => {
    prisma.fareProposal.findUnique.mockResolvedValue({
      ...PENDING,
      status: "APPROVED",
    });

    const result = await reviewProposal({
      proposalId: "prop-1",
      decision: "approve",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(
      "This proposal was already decided",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("claims the decision with a status guard, not a blind write", async () => {
    // Two maintainers clicking at the same moment both pass the read above.
    // The WHERE status = PENDING is what actually decides who wins.
    await reviewProposal({ proposalId: "prop-1", decision: "approve" });

    const claim = tx.fareProposal.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: "prop-1", status: "PENDING" });
  });

  it("aborts when another maintainer claimed it first", async () => {
    tx.fareProposal.updateMany.mockResolvedValue({ count: 0 });

    const result = await reviewProposal({
      proposalId: "prop-1",
      decision: "approve",
    });

    expect(result.ok).toBe(false);
    expect(applyFareChange).not.toHaveBeenCalled();
  });

  it("serializes approvals per route with an advisory lock", async () => {
    // Without this two concurrent PENDING proposals on one route could both
    // land as APPROVED and the second would overwrite the first's fare.
    await reviewProposal({ proposalId: "prop-1", decision: "approve" });

    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it("refuses a proposal that isn't there", async () => {
    prisma.fareProposal.findUnique.mockResolvedValue(null);

    const result = await reviewProposal({
      proposalId: "ghost",
      decision: "approve",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("Proposal not found");
  });
});

describe("reviewProposal — rewards", () => {
  it("writes the fare and rewards the submitter on approval", async () => {
    await reviewProposal({ proposalId: "prop-1", decision: "approve" });

    expect(applyFareChange).toHaveBeenCalled();
    expect(awardPoints).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: "rider-1", reason: "APPROVED" }),
    );
  });

  it("claws the submit nod back on rejection so junk nets zero", async () => {
    await reviewProposal({ proposalId: "prop-1", decision: "reject" });

    expect(applyFareChange).not.toHaveBeenCalled();
    expect(awardPoints).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ reason: "REJECT_CLAWBACK" }),
    );
  });

  it("credits siblings that were right but landed second", async () => {
    tx.fareProposal.findMany.mockResolvedValue([
      { id: "prop-2", submittedById: "rider-2" },
      { id: "prop-3", submittedById: "rider-3" },
    ]);
    tx.fareProposal.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    const result = await reviewProposal({
      proposalId: "prop-1",
      decision: "approve",
    });

    expect(result.ok && result.superseded).toBe(2);
    const credited = awardPoints.mock.calls
      .filter((c) => c[1].reason === "SUPERSEDED_CREDIT")
      .map((c) => c[1].userId);
    expect(credited).toEqual(["rider-2", "rider-3"]);
  });

  it("reads the siblings before superseding them", async () => {
    // Afterwards they are no longer PENDING, so the query that finds who to
    // credit would come back empty and the partial credit would vanish.
    tx.fareProposal.findMany.mockResolvedValue([
      { id: "prop-2", submittedById: "rider-2" },
    ]);

    await reviewProposal({ proposalId: "prop-1", decision: "approve" });

    const findOrder = tx.fareProposal.findMany.mock.invocationCallOrder[0];
    const bulkUpdateOrder =
      tx.fareProposal.updateMany.mock.invocationCallOrder[1];
    expect(findOrder).toBeLessThan(bulkUpdateOrder);
  });
});
