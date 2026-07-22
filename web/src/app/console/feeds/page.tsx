import { ConsolePageHeader } from "@/components/console/page-header";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { FeedVersionsList, type FeedVersionRow } from "./feed-versions-list";

export const dynamic = "force-dynamic";

export default async function FeedVersionsPage() {
  await requireRole(CONSOLE_ROLES);

  const [versions, pendingProposals, fareCount, lastVersion] = await Promise.all([
    prisma.feedVersion.findMany({
      orderBy: { version: "desc" },
      take: 20,
      select: {
        version: true,
        label: true,
        sizeBytes: true,
        fareChangeCount: true,
        validatorStatus: true,
        generatedById: true,
        createdAt: true,
        lastChangeLogId: true,
      },
    }),
    prisma.fareProposal.count({ where: { status: "PENDING" } }),
    prisma.fare.count({ where: { kind: "FLAT", flatAmountEtb: { not: null } } }),
    prisma.feedVersion.findFirst({
      orderBy: { version: "desc" },
      select: { lastChangeLogId: true },
    }),
  ]);

  // generatedById is a plain user id (no FK) — resolve names in one query.
  const genIds = [...new Set(versions.map((v) => v.generatedById))];
  const users = await prisma.user.findMany({
    where: { id: { in: genIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  // How many approved fare changes are waiting to be published in a new version.
  let unpublishedChanges: number;
  if (lastVersion?.lastChangeLogId) {
    const cursor = await prisma.fareChangeLog.findUnique({
      where: { id: lastVersion.lastChangeLogId },
      select: { createdAt: true },
    });
    unpublishedChanges = cursor
      ? await prisma.fareChangeLog.count({
          where: { createdAt: { gt: cursor.createdAt } },
        })
      : await prisma.fareChangeLog.count();
  } else {
    unpublishedChanges = await prisma.fareChangeLog.count();
  }

  const rows: FeedVersionRow[] = versions.map((v) => ({
    version: v.version,
    label: v.label,
    sizeBytes: v.sizeBytes,
    fareChangeCount: v.fareChangeCount,
    validatorStatus: v.validatorStatus,
    generatedByName: nameById.get(v.generatedById) ?? "A maintainer",
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <>
      <ConsolePageHeader
        title="Feed Versions"
        subtitle="Versioned GTFS exports — approved fares overlaid on the base feed"
      />
      <FeedVersionsList
        rows={rows}
        flatFareCount={fareCount}
        unpublishedChanges={unpublishedChanges}
        pendingProposals={pendingProposals}
      />
    </>
  );
}
