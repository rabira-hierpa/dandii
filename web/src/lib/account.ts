import { prisma } from "@/lib/prisma";

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

export interface AccountData {
  savedRoutes: SavedRouteItem[];
  submissions: SubmissionItem[];
  /** Submissions decided after the user last viewed the list (D2 badge). */
  unseenCount: number;
}

function proposedLabel(p: {
  proposedKind: "FLAT" | "TIERED";
  proposedFlatEtb: { toNumber(): number } | null;
  proposedTiers: unknown;
}): string {
  if (p.proposedKind === "FLAT") {
    return `Flat · ${p.proposedFlatEtb?.toNumber() ?? 0} ETB`;
  }
  const tiers = (p.proposedTiers as { amountEtb: number }[] | null) ?? [];
  if (tiers.length === 0) return "Tiered";
  const amounts = tiers.map((t) => t.amountEtb);
  return `Tiered · ${Math.min(...amounts)}–${Math.max(...amounts)} ETB`;
}

export async function getAccountData(userId: string): Promise<AccountData> {
  const [saved, proposals, user] = await Promise.all([
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
      select: { lastSubmissionsViewedAt: true },
    }),
  ]);

  const lastViewed = user?.lastSubmissionsViewedAt ?? new Date(0);
  const unseenCount = proposals.filter(
    (p) => p.decidedAt != null && p.decidedAt > lastViewed,
  ).length;

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
      proposedLabel: proposedLabel(p),
      reviewNote: p.reviewNote,
      decidedAt: p.decidedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    unseenCount,
  };
}
