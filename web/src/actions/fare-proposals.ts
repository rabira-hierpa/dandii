"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { applyFareChange, type FareData } from "@/lib/fare-write";
import { prisma } from "@/lib/prisma";
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

/** Rebuild the applyFareChange payload from a proposal's proposed-* columns. */
function proposedFareData(proposal: {
  proposedKind: "FLAT" | "TIERED";
  proposedFlatEtb: Prisma.Decimal | null;
  proposedTiers: Prisma.JsonValue;
}): FareData {
  if (proposal.proposedKind === "FLAT") {
    return { kind: "FLAT", flatAmountEtb: proposal.proposedFlatEtb!.toNumber() };
  }
  const tiers = (proposal.proposedTiers as unknown as ProposalTier[]) ?? [];
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
    const proposal = await prisma.fareProposal.create({
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
    revalidatePath("/console/proposals");
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

  const superseded = await prisma.$transaction(async (tx) => {
    // Claim the decision; 0 rows means another maintainer got here first.
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

    if (decision === "reject") return 0;

    await applyFareChange(tx, proposal.routeId, proposedFareData(proposal), {
      source: "PROPOSAL_APPROVAL",
      changedById: session.user.id,
      proposalId: proposal.id,
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
  return { ok: true, decision, superseded };
}

class AlreadyDecidedError extends Error {}
