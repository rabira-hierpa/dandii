import type { Prisma } from "@/generated/prisma/client";

/**
 * Contributor rewards — the "Fare Scout" status ladder.
 * See docs/rewards-and-amharic-design.md.
 *
 * Design rule: reward APPROVAL, not submission. Submitting earns a small nod;
 * a human-reviewed approval earns the real points. Rejection claws the nod back
 * so junk nets zero. That keeps the two-stage dopamine without paying people to
 * spam the review queue (fare accuracy is the product).
 *
 * The PointsLedger is the source of truth; `User.points` is a cached sum.
 */

/** Point values per event. */
export const POINTS = {
  SUBMIT: 2,
  APPROVED: 20,
  REJECT_CLAWBACK: -2,
  SUPERSEDED_CREDIT: 10,
} as const;

export interface Level {
  level: number;
  title: string;
  /** Points required to reach this level. */
  from: number;
}

/** Ladder thresholds. Level is always derived from points — never stored. */
export const LEVELS: Level[] = [
  { level: 1, title: "Newcomer", from: 0 },
  { level: 2, title: "Fare Spotter", from: 25 },
  { level: 3, title: "Fare Scout", from: 75 },
  { level: 4, title: "Route Ranger", from: 200 },
  { level: 5, title: "Transit Guardian", from: 500 },
  { level: 6, title: "Transit Legend", from: 1000 },
];

export interface LevelProgress {
  level: number;
  title: string;
  points: number;
  /** Points at which the current level started. */
  levelFloor: number;
  /** Points needed for the next level; null at max level. */
  nextAt: number | null;
  /** Points still needed to level up; null at max level. */
  toNext: number | null;
  /** 0-100 progress through the current level; 100 at max level. */
  percent: number;
}

/** Resolve a point total to its level, title, and progress to the next one. */
export function levelForPoints(points: number): LevelProgress {
  const safe = Number.isFinite(points) ? Math.max(0, Math.trunc(points)) : 0;
  let current = LEVELS[0];
  for (const l of LEVELS) if (safe >= l.from) current = l;

  const next = LEVELS.find((l) => l.from > safe) ?? null;
  if (!next) {
    return {
      level: current.level,
      title: current.title,
      points: safe,
      levelFloor: current.from,
      nextAt: null,
      toNext: null,
      percent: 100,
    };
  }
  const span = next.from - current.from;
  const gained = safe - current.from;
  return {
    level: current.level,
    title: current.title,
    points: safe,
    levelFloor: current.from,
    nextAt: next.from,
    toNext: next.from - safe,
    percent: span > 0 ? Math.round((gained / span) * 100) : 0,
  };
}

/** Badge ids and the approved-contribution count that earns them. */
export const COUNT_BADGES = [
  { badge: "first_fix", label: "First Fix", approvedRequired: 1, bonus: 5 },
  {
    badge: "reliable_reporter",
    label: "Reliable Reporter",
    approvedRequired: 10,
    bonus: 15,
  },
  {
    badge: "fare_authority",
    label: "Fare Authority",
    approvedRequired: 50,
    bonus: 50,
  },
] as const;

export const BADGE_LABELS: Record<string, string> = Object.fromEntries(
  COUNT_BADGES.map((b) => [b.badge, b.label]),
);

/** Minimal transaction surface these helpers need (works with $transaction). */
type Tx = Prisma.TransactionClient;

type AwardReason =
  | "SUBMIT"
  | "APPROVED"
  | "REJECT_CLAWBACK"
  | "SUPERSEDED_CREDIT"
  | "BADGE_BONUS"
  | "BACKFILL";

/**
 * Award (or claw back) points inside an existing transaction.
 *
 * Idempotent per (proposalId, reason) via a unique index: a retry or a
 * concurrent decision can never double-pay for the same event. Returns true
 * when a new ledger row was written, false when it was a duplicate.
 */
export async function awardPoints(
  tx: Tx,
  args: {
    userId: string;
    delta: number;
    reason: AwardReason;
    proposalId?: string | null;
  },
): Promise<boolean> {
  const { userId, delta, reason, proposalId = null } = args;
  if (delta === 0) return false;

  // Guard the idempotency key explicitly: the unique index only covers rows
  // WITH a proposalId (NULLs are distinct in Postgres), and we want a clean
  // boolean rather than catching a constraint error mid-transaction.
  if (proposalId) {
    const existing = await tx.pointsLedger.findFirst({
      where: { proposalId, reason },
      select: { id: true },
    });
    if (existing) return false;
  }

  await tx.pointsLedger.create({
    data: { userId, delta, reason, proposalId },
  });
  await tx.user.update({
    where: { id: userId },
    data: { points: { increment: delta } },
  });
  return true;
}

/**
 * Grant any count-based badges the user has newly earned, with their bonus.
 * Called after an approval lands. Returns the badge ids granted (usually none).
 */
export async function deriveBadges(tx: Tx, userId: string): Promise<string[]> {
  const approved = await tx.fareProposal.count({
    where: { submittedById: userId, status: "APPROVED" },
  });

  const earned = COUNT_BADGES.filter((b) => approved >= b.approvedRequired);
  if (earned.length === 0) return [];

  const existing = await tx.userBadge.findMany({
    where: { userId, badge: { in: earned.map((b) => b.badge) } },
    select: { badge: true },
  });
  const have = new Set(existing.map((e) => e.badge));
  const granted: string[] = [];

  for (const b of earned) {
    if (have.has(b.badge)) continue;
    await tx.userBadge.create({ data: { userId, badge: b.badge } });
    // Badge bonuses aren't tied to a proposal, so they carry no idempotency
    // key — the badge row itself (composite PK) is what prevents repeats.
    await tx.pointsLedger.create({
      data: { userId, delta: b.bonus, reason: "BADGE_BONUS" },
    });
    await tx.user.update({
      where: { id: userId },
      data: { points: { increment: b.bonus } },
    });
    granted.push(b.badge);
  }
  return granted;
}
