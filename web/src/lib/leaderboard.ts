import { levelForPoints } from "@/lib/points";
import { prisma } from "@/lib/prisma";

/**
 * Public contributor leaderboard (R2).
 *
 * Privacy rule: only users who explicitly opted in (`leaderboardOptIn`) are
 * ever listed. Everyone else contributes invisibly — the ladder on their own
 * profile still works. Nothing here exposes an email or any other PII.
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  level: number;
  title: string;
  titleKey: string;
  approvedCount: number;
  /** True for the signed-in viewer, so the UI can highlight their row. */
  isViewer: boolean;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  /** The viewer's own standing when they opted in but fell outside the top N. */
  viewerEntry: LeaderboardEntry | null;
  /** Whether the signed-in viewer is listed at all (drives the opt-in nudge). */
  viewerOptedIn: boolean;
}

export async function getLeaderboard(
  viewerId?: string,
  limit = 25,
): Promise<LeaderboardData> {
  // Rank across every opted-in contributor with points, so a viewer outside
  // the top N still gets a truthful rank rather than a fabricated one.
  const ranked = await prisma.user.findMany({
    where: { leaderboardOptIn: true, points: { gt: 0 } },
    orderBy: [{ points: "desc" }, { name: "asc" }],
    select: { id: true, name: true, points: true },
  });

  const approvedCounts = await prisma.fareProposal.groupBy({
    by: ["submittedById"],
    where: {
      status: "APPROVED",
      submittedById: { in: ranked.map((u) => u.id) },
    },
    _count: { _all: true },
  });
  const approvedById = new Map(
    approvedCounts.map((c) => [c.submittedById, c._count._all]),
  );

  const toEntry = (
    u: { id: string; name: string; points: number },
    index: number,
  ): LeaderboardEntry => {
    const progress = levelForPoints(u.points);
    return {
      rank: index + 1,
      userId: u.id,
      name: u.name,
      points: u.points,
      level: progress.level,
      title: progress.title,
      titleKey: progress.titleKey,
      approvedCount: approvedById.get(u.id) ?? 0,
      isViewer: u.id === viewerId,
    };
  };

  const entries = ranked.slice(0, limit).map(toEntry);

  const viewerIndex = viewerId
    ? ranked.findIndex((u) => u.id === viewerId)
    : -1;
  const viewerEntry =
    viewerIndex >= limit ? toEntry(ranked[viewerIndex], viewerIndex) : null;

  return { entries, viewerEntry, viewerOptedIn: viewerIndex >= 0 };
}
