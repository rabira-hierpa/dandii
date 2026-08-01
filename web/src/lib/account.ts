import { prisma } from "@/lib/prisma";
import { BADGE_LABELS, levelForPoints } from "@/lib/points";
import { formatProposedLabel } from "@/lib/proposed-label";

export interface SavedRouteItem {
  routeId: string;
  shortName: string;
  longName: string;
  operatorCode: string | null;
}

export interface SubmissionItem {
  id: string;
  routeShortName: string;
  routeLongName: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  proposedLabel: string;
  reviewNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** Contributor rewards summary shown on "My Contributions" (R1). */
export interface ContributionStats {
  points: number;
  level: number;
  title: string;
  /** Points needed for the next level; null at max level. */
  nextAt: number | null;
  toNext: number | null;
  /** 0-100 progress through the current level. */
  percent: number;
  approvedCount: number;
  pendingCount: number;
  /** Distinct routes the user has an approved fare on (impact line). */
  routesImproved: number;
  badges: { badge: string; label: string; earnedAt: string }[];
}

export interface AccountData {
  savedRoutes: SavedRouteItem[];
  submissions: SubmissionItem[];
  /** Submissions decided after the user last viewed the list (D2 badge). */
  unseenCount: number;
  contributions: ContributionStats;
}

/** Format a proposed fare for list UIs (profile, account menu, library rail). */
export { formatProposedLabel } from "@/lib/proposed-label";

export async function getAccountData(userId: string): Promise<AccountData> {
  const [saved, proposals, user, badges, approvedRoutes] = await Promise.all([
    prisma.savedRoute.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        route: {
          select: {
            id: true,
            shortName: true,
            longName: true,
            assignment: { select: { operator: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.fareProposal.findMany({
      where: { submittedById: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        reviewNote: true,
        decidedAt: true,
        createdAt: true,
        proposedKind: true,
        proposedFlatEtb: true,
        proposedTiers: true,
        route: { select: { shortName: true, longName: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { lastSubmissionsViewedAt: true, points: true },
    }),
    prisma.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: "asc" },
      select: { badge: true, earnedAt: true },
    }),
    prisma.fareProposal.findMany({
      where: { submittedById: userId, status: "APPROVED" },
      select: { routeId: true },
      distinct: ["routeId"],
    }),
  ]);

  const lastViewed = user?.lastSubmissionsViewedAt ?? new Date(0);
  const unseenCount = proposals.filter(
    (p) => p.decidedAt != null && p.decidedAt > lastViewed,
  ).length;

  const progress = levelForPoints(user?.points ?? 0);
  const contributions: ContributionStats = {
    points: progress.points,
    level: progress.level,
    title: progress.title,
    nextAt: progress.nextAt,
    toNext: progress.toNext,
    percent: progress.percent,
    approvedCount: proposals.filter((p) => p.status === "APPROVED").length,
    pendingCount: proposals.filter((p) => p.status === "PENDING").length,
    routesImproved: approvedRoutes.length,
    badges: badges.map((b) => ({
      badge: b.badge,
      label: BADGE_LABELS[b.badge] ?? b.badge,
      earnedAt: b.earnedAt.toISOString(),
    })),
  };

  return {
    savedRoutes: saved.map((s) => ({
      routeId: s.route.id,
      shortName: s.route.shortName,
      longName: s.route.longName,
      operatorCode: s.route.assignment?.operator.code ?? null,
    })),
    submissions: proposals.map((p) => ({
      id: p.id,
      routeShortName: p.route.shortName,
      routeLongName: p.route.longName,
      status: p.status as SubmissionItem["status"],
      proposedLabel: formatProposedLabel(p),
      reviewNote: p.reviewNote,
      decidedAt: p.decidedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    unseenCount,
    contributions,
  };
}
