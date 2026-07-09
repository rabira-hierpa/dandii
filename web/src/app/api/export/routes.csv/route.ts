import { csvResponse, requireExportAccess, toCsv } from "@/lib/csv";
import { OPERATOR_CODES, type OperatorCode } from "@/lib/operators";
import { prisma } from "@/lib/prisma";
import { getClosedRouteIds } from "@/lib/transit";

/**
 * Full route inventory with operator, geometry length, fare structure, and
 * live open/closed status. Honors the Routes page filters via query params:
 * ?q=<search> &operator=<CODE> &status=open|closed
 */
export async function GET(request: Request) {
  const denied = await requireExportAccess();
  if (denied) return denied;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const operatorParam = url.searchParams.get("operator") as OperatorCode | null;
  const operatorFilter =
    operatorParam && OPERATOR_CODES.includes(operatorParam)
      ? operatorParam
      : null;
  const statusFilter = url.searchParams.get("status");

  const [routes, closedIds] = await Promise.all([
    prisma.route.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { shortName: { contains: q, mode: "insensitive" } },
                { longName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(operatorFilter
          ? { assignment: { operator: { code: operatorFilter } } }
          : {}),
      },
      select: {
        id: true,
        shortName: true,
        longName: true,
        type: true,
        lengthMeters: true,
        assignment: {
          select: {
            assignedAt: true,
            operator: { select: { code: true, name: true } },
          },
        },
        fare: {
          select: {
            kind: true,
            flatAmountEtb: true,
            tiers: {
              select: { label: true, fromKm: true, toKm: true, amountEtb: true },
              orderBy: { fromKm: "asc" },
            },
          },
        },
        closures: {
          where: { endsAt: { gte: new Date() }, startsAt: { lte: new Date() } },
          select: { reason: true, endsAt: true },
          orderBy: { endsAt: "desc" },
          take: 1,
        },
      },
      orderBy: { shortName: "asc" },
    }),
    getClosedRouteIds(),
  ]);

  const filtered = routes.filter((route) => {
    if (statusFilter === "open") return !closedIds.has(route.id);
    if (statusFilter === "closed") return closedIds.has(route.id);
    return true;
  });

  const header = [
    "route_id",
    "short_name",
    "long_name",
    "type",
    "operator_code",
    "operator_name",
    "length_km",
    "fare_kind",
    "flat_fare_etb",
    "fare_min_etb",
    "fare_max_etb",
    "fare_tiers",
    "status",
    "closure_reason",
    "closure_ends_at",
    "assigned_at",
  ];

  const rows = filtered.map((route) => {
    const prices =
      route.fare?.kind === "FLAT"
        ? [route.fare.flatAmountEtb?.toNumber() ?? null].filter(
            (v): v is number => v != null,
          )
        : (route.fare?.tiers.map((t) => t.amountEtb.toNumber()) ?? []);
    const closed = closedIds.has(route.id);
    const closure = route.closures[0];
    return [
      route.id,
      route.shortName,
      route.longName,
      route.type === 0 ? "LRT" : "BUS",
      route.assignment?.operator.code ?? "",
      route.assignment?.operator.name ?? "",
      route.lengthMeters ? (route.lengthMeters / 1000).toFixed(2) : "",
      route.fare?.kind ?? "",
      route.fare?.kind === "FLAT"
        ? (route.fare.flatAmountEtb?.toNumber() ?? "")
        : "",
      prices.length > 0 ? Math.min(...prices) : "",
      prices.length > 0 ? Math.max(...prices) : "",
      route.fare?.kind === "TIERED"
        ? route.fare.tiers
            .map((t) => `${t.label}: ${t.amountEtb.toNumber()} ETB`)
            .join(" | ")
        : "",
      closed ? "CLOSED" : "OPEN",
      closed ? (closure?.reason ?? "") : "",
      closed ? (closure?.endsAt.toISOString() ?? "") : "",
      route.assignment?.assignedAt.toISOString() ?? "",
    ];
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(
    `menged-routes-${stamp}.csv`,
    toCsv(header, rows),
  );
}
