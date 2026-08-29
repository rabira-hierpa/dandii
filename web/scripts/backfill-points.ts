/**
 * Retro-credit contributors for fare proposals decided before rewards (R1)
 * shipped. Without this, everyone who helped early starts at zero and the
 * ladder looks empty on day one.
 *
 * Awards, per already-decided proposal (idempotent — the ledger's
 * (proposalId, reason) uniqueness means re-running changes nothing):
 *   APPROVED   -> BACKFILL +20 (POINTS.APPROVED)
 *   SUPERSEDED -> BACKFILL +10 (POINTS.SUPERSEDED_CREDIT)
 * PENDING and REJECTED are skipped: pending isn't earned yet, and rejected
 * nets zero by design.
 *
 * Badges are derived afterwards from approved counts.
 *
 * Usage:  npx tsx --env-file-if-exists=.env scripts/backfill-points.ts [--dry-run]
 */
import { prisma } from "@/lib/prisma";
import { deriveBadges, POINTS } from "@/lib/points";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const proposals = await prisma.fareProposal.findMany({
    where: { status: { in: ["APPROVED", "SUPERSEDED"] } },
    select: { id: true, submittedById: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  // Skip anything already credited (safe re-runs).
  const credited = await prisma.pointsLedger.findMany({
    where: { proposalId: { in: proposals.map((p) => p.id) } },
    select: { proposalId: true },
  });
  const done = new Set(credited.map((c) => c.proposalId));
  const todo = proposals.filter((p) => !done.has(p.id));

  const byUser = new Map<string, number>();
  for (const p of todo) {
    const delta =
      p.status === "APPROVED" ? POINTS.APPROVED : POINTS.SUPERSEDED_CREDIT;
    byUser.set(p.submittedById, (byUser.get(p.submittedById) ?? 0) + delta);
  }

  console.log(
    `${proposals.length} decided proposals | ${done.size} already credited | ${todo.length} to backfill across ${byUser.size} users`,
  );
  if (DRY_RUN) {
    for (const [userId, total] of byUser) console.log(`  ${userId}: +${total}`);
    console.log("dry run — nothing written");
    return;
  }
  if (todo.length === 0) {
    console.log("nothing to do");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of todo) {
      const delta =
        p.status === "APPROVED" ? POINTS.APPROVED : POINTS.SUPERSEDED_CREDIT;
      await tx.pointsLedger.create({
        data: {
          userId: p.submittedById,
          delta,
          reason: "BACKFILL",
          proposalId: p.id,
        },
      });
    }
    for (const [userId, total] of byUser) {
      await tx.user.update({
        where: { id: userId },
        data: { points: { increment: total } },
      });
      await deriveBadges(tx, userId);
    }
  });

  console.log(`backfilled ${todo.length} proposals for ${byUser.size} users`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
