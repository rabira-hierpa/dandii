import { csvResponse, requireExportAccess, toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

/** Full closure history with route context and who created each closure. */
export async function GET() {
  const denied = await requireExportAccess();
  if (denied) return denied;

  const closures = await prisma.routeClosure.findMany({
    select: {
      id: true,
      routeId: true,
      reason: true,
      note: true,
      startsAt: true,
      endsAt: true,
      createdById: true,
      createdAt: true,
      route: {
        select: {
          shortName: true,
          longName: true,
          assignment: { select: { operator: { select: { code: true } } } },
        },
      },
    },
    orderBy: { startsAt: "desc" },
  });

  // createdById is a plain string column (no FK into auth tables) — resolve
  // the display names in one query.
  const creatorIds = [...new Set(closures.map((c) => c.createdById))];
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true, email: true },
  });
  const creatorById = new Map(creators.map((u) => [u.id, u]));

  const now = Date.now();
  const header = [
    "closure_id",
    "route_id",
    "route_short_name",
    "route_long_name",
    "operator_code",
    "reason",
    "note",
    "starts_at",
    "ends_at",
    "duration_hours",
    "status",
    "created_by",
    "created_at",
  ];

  const rows = closures.map((closure) => {
    const creator = creatorById.get(closure.createdById);
    const status =
      closure.endsAt.getTime() < now
        ? "ENDED"
        : closure.startsAt.getTime() > now
          ? "SCHEDULED"
          : "ACTIVE";
    return [
      closure.id,
      closure.routeId,
      closure.route.shortName,
      closure.route.longName,
      closure.route.assignment?.operator.code ?? "",
      closure.reason,
      closure.note ?? "",
      closure.startsAt.toISOString(),
      closure.endsAt.toISOString(),
      (
        (closure.endsAt.getTime() - closure.startsAt.getTime()) /
        3600_000
      ).toFixed(1),
      status,
      creator ? `${creator.name} <${creator.email}>` : closure.createdById,
      closure.createdAt.toISOString(),
    ];
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`menged-closures-${stamp}.csv`, toCsv(header, rows));
}
