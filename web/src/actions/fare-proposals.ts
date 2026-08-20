"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { applyFareChange, type FareData } from "@/lib/fare-write";
import { awardPoints, deriveBadges, POINTS } from "@/lib/points";
import { prisma } from "@/lib/prisma";
import { denyOutOfScope } from "@/lib/operator-scope";
import { getSession, requirePermission } from "@/lib/session";
import {
  RATE_LIMIT_PER_DAY,
  reviewProposalSchema,
  submitProposalSchema,
  type ProposalTier,
  type ReviewProposalInput,
  type SubmitProposalInput,
} from "./proposal-schema";

type Result<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Rebuild + re-validate the applyFareChange payload from a proposal's
 * proposed-* columns (same ceilings as submit).
 */
function validatedProposedFareData(proposal: {
  routeId: string;
  proposedKind: "FLAT" | "TIERED";
  proposedFlatEtb: Prisma.Decimal | null;
  proposedTiers: Prisma.JsonValue;
}): FareData {
  if (proposal.proposedKind === "FLAT") {
    const flatAmountEtb = proposal.proposedFlatEtb?.toNumber() ?? 0;
    submitProposalSchema.parse({
      routeId: proposal.routeId,
      kind: "FLAT",
      flatAmountEtb,
    });
    return { kind: "FLAT", flatAmountEtb };
  }
  const tiers = (proposal.proposedTiers as unknown as ProposalTier[]) ?? [];
  submitProposalSchema.parse({
    routeId: proposal.routeId,
    kind: "TIERED",
    tiers,
  });
  return { kind: "TIERED", tiers };
}

/**
 * Rider submits a fare correction for a route. Guards: signed in, one PENDING
 * proposal per route (partial-unique index), rolling-24h rate limit, and
 * amount validation (schema). Snapshots the current fare as the baseline so
 * the maintainer's diff stays stable even if the fare changes later.
 */
export async function submitProposal(
  input: SubmitProposalInput,
): Promise<Result<{ proposalId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to suggest a fare correction" };

  const parsed = submitProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid fare" };
  }
  const data = parsed.data;

  const route = await prisma.route.findUnique({ where: { id: data.routeId } });
  if (!route) return { ok: false, error: "Unknown route" };

  // Rolling-24h rate limit (measured from submission time — no timezone edge).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.fareProposal.count({
    where: { submittedById: session.user.id, createdAt: { gte: since } },
  });
  if (recent >= RATE_LIMIT_PER_DAY) {
    return {
      ok: false,
      error: `You've submitted ${RATE_LIMIT_PER_DAY} edits today — try again tomorrow`,
    };
  }

  // Baseline snapshot: the fare as it stands right now (may be null).
  const baseline = await prisma.fare.findUnique({
    where: { routeId: data.routeId },
    include: { tiers: { orderBy: { fromKm: "asc" } } },
  });

  try {
    // Create + award in one transaction so points can never drift from the
    // proposals that earned them (rewards R1).
    const proposal = await prisma.$transaction(async (tx) => {
      const created = await tx.fareProposal.create({
        data: {
          routeId: data.routeId,
          submittedById: session.user.id,
          note: data.note,
          proposedKind: data.kind,
          proposedFlatEtb: data.kind === "FLAT" ? data.flatAmountEtb : null,
          proposedTiers:
            data.kind === "TIERED"
              ? (data.tiers as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          baselineKind: baseline?.kind ?? null,
          baselineFlatEtb: baseline?.flatAmountEtb ?? null,
          baselineTiers: baseline
            ? (baseline.tiers.map((t) => ({
                label: t.label,
                fromKm: t.fromKm,
                toKm: t.toKm,
                amountEtb: t.amountEtb.toNumber(),
              })) as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });
      // Small nod for submitting; the real reward comes on approval.
      await awardPoints(tx, {
        userId: session.user.id,
        delta: POINTS.SUBMIT,
        reason: "SUBMIT",
        proposalId: created.id,
      });
      return created;
    });
    revalidatePath("/console/proposals");
    revalidatePath("/profile");
    return { ok: true, proposalId: proposal.id };
  } catch (e) {
    // Partial-unique violation = an open proposal already exists for this route.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok: false,
        error: "You already have a pending edit for this route",
      };
    }
    throw e;
  }
}

/**
 * Maintainer approves or rejects a proposal. Approval writes the fare via the
 * shared permission-free helper and marks every other PENDING proposal on the
 * route SUPERSEDED (cross-user consolidation, 5A). A `WHERE status = 'PENDING'`
 * guard makes concurrent decisions safe (double-decision guard).
 */
export async function reviewProposal(
  input: ReviewProposalInput,
): Promise<Result<{ decision: "approve" | "reject"; superseded: number }>> {
  const session = await requirePermission({ proposal: ["review"] });
  const { proposalId, decision, reviewNote } = reviewProposalSchema.parse(input);

  const proposal = await prisma.fareProposal.findUnique({
    where: { id: proposalId },
  });
  if (!proposal) return { ok: false, error: "Proposal not found" };
  if (proposal.status !== "PENDING") {
    return { ok: false, error: "This proposal was already decided" };
  }

  // Approving writes a Fare on the proposal's route and credits the submitter,
  // so it is a write to that route and scoped like one.
  const denied = await denyOutOfScope(session.user.id, {
    routeId: proposal.routeId,
  });
  if (denied) return denied;

  const superseded = await prisma.$transaction(async (tx) => {
    // Serialize approvals per route so two concurrent PENDING proposals cannot
    // both land as APPROVED (advisory lock released at end of this tx).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${proposal.routeId}))`;

    // Claim the decision; 0 rows means another maintainer got here first
    // (or a sibling approval already superseded this row).
    const claimed = await tx.fareProposal.updateMany({
      where: { id: proposalId, status: "PENDING" },
      data: {
        status: decision === "approve" ? "APPROVED" : "REJECTED",
        reviewedById: session.user.id,
        reviewNote: reviewNote ?? null,
        decidedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new AlreadyDecidedError();
    }

    if (decision === "reject") {
      // Claw back the submit nod so junk nets zero (rewards R1).
      await awardPoints(tx, {
        userId: proposal.submittedById,
        delta: POINTS.REJECT_CLAWBACK,
        reason: "REJECT_CLAWBACK",
        proposalId: proposal.id,
      });
      return 0;
    }

    // Re-validate amounts at approval so corrupt/tampered proposed* columns
    // never reach applyFareChange or the GTFS export (see proposal-schema.ts).
    const fareData = validatedProposedFareData(proposal);

    await applyFareChange(tx, proposal.routeId, fareData, {
      source: "PROPOSAL_APPROVAL",
      changedById: session.user.id,
      proposalId: proposal.id,
    });

    // The real reward: a human validated this fare (rewards R1).
    await awardPoints(tx, {
      userId: proposal.submittedById,
      delta: POINTS.APPROVED,
      reason: "APPROVED",
      proposalId: proposal.id,
    });
    await deriveBadges(tx, proposal.submittedById);

    // Capture the siblings BEFORE the bulk update — afterwards they're no
    // longer PENDING and we'd lose track of who to credit.
    const siblings = await tx.fareProposal.findMany({
      where: { routeId: proposal.routeId, status: "PENDING" },
      select: { id: true, submittedById: true },
    });

    // Cross-user consolidation: resolve the sibling pendings on this route.
    const sup = await tx.fareProposal.updateMany({
      where: { routeId: proposal.routeId, status: "PENDING" },
      data: {
        status: "SUPERSEDED",
        reviewedById: session.user.id,
        reviewNote: "Resolved by an approved edit for this route",
        decidedAt: new Date(),
      },
    });

    // Partial credit: they were right, someone just landed first.
    for (const s of siblings) {
      await awardPoints(tx, {
        userId: s.submittedById,
        delta: POINTS.SUPERSEDED_CREDIT,
        reason: "SUPERSEDED_CREDIT",
        proposalId: s.id,
      });
    }
    return sup.count;
  }).catch((e) => {
    if (e instanceof AlreadyDecidedError) return -1;
    throw e;
  });

  if (superseded === -1) {
    return { ok: false, error: "This proposal was already decided" };
  }

  revalidatePath("/console/proposals");
  revalidatePath("/console");
  revalidatePath("/console/fares");
  revalidatePath("/profile");
  return { ok: true, decision, superseded };
}

class AlreadyDecidedError extends Error {}
