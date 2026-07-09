import Link from "next/link";
import { ConsolePageHeader } from "@/components/console/page-header";
import type { OperatorCode } from "@/lib/operators";
import { OPERATOR_CODES } from "@/lib/operators";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { getClosedRouteIds, summarizeFare } from "@/lib/transit";
import { RouteFilters } from "./filters";
import { RoutesTable, type RouteRow } from "./routes-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function RouteAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; operator?: string; page?: string }>;
}) {
  const { role } = await requireRole(CONSOLE_ROLES);
  const canAssign = role !== "maintainer";
  const canEdit = role !== "maintainer";
  const canDelete = role === "super-admin" || role === "admin";

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const operatorFilter = OPERATOR_CODES.includes(
    params.operator as OperatorCode,
  )
    ? (params.operator as OperatorCode)
    : null;
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { shortName: { contains: q, mode: "insensitive" as const } },
            { longName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(operatorFilter
      ? { assignment: { operator: { code: operatorFilter } } }
      : {}),
  };

  const [routes, total, operators, closedIds] = await Promise.all([
    prisma.route.findMany({
      where,
      select: {
        id: true,
        shortName: true,
        longName: true,
        type: true,
        lengthMeters: true,
        assignment: {
          select: {
            operatorId: true,
            operator: { select: { code: true } },
          },
        },
        fare: {
          select: {
            kind: true,
            flatAmountEtb: true,
            tiers: { select: { amountEtb: true } },
          },
        },
      },
      orderBy: { shortName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.route.count({ where }),
    prisma.operator.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getClosedRouteIds(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (operatorFilter) sp.set("operator", operatorFilter);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/console/routes${qs ? `?${qs}` : ""}`;
  };

  const rows: RouteRow[] = routes.map((route) => ({
    id: route.id,
    shortName: route.shortName,
    longName: route.longName,
    type: route.type,
    lengthKm: route.lengthMeters != null ? route.lengthMeters / 1000 : null,
    fareLabel: summarizeFare(route.fare)?.label ?? null,
    operatorId: route.assignment?.operatorId ?? null,
    operatorCode:
      (route.assignment?.operator.code as OperatorCode | undefined) ?? null,
    closed: closedIds.has(route.id),
  }));

  return (
    <>
      <ConsolePageHeader
        title="Route Assignment"
        subtitle="Map route_ids to operating agencies · changes apply across the console"
        action={
          <a
            href={`/api/export/routes.csv${(() => {
              const sp = new URLSearchParams();
              if (q) sp.set("q", q);
              if (operatorFilter) sp.set("operator", operatorFilter);
              const qs = sp.toString();
              return qs ? `?${qs}` : "";
            })()}`}
            className="shrink-0 rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-[#3D4A3F] hover:bg-[#F4F5F2]"
          >
            Export CSV
          </a>
        }
      />
      <RouteFilters resultCount={total} />

      <RoutesTable
        rows={rows}
        operators={operators}
        canAssign={canAssign}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px] text-[#5C6B5E]">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-1.5 font-semibold text-[#3D4A3F] hover:bg-[#F4F5F2]"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-1.5 font-semibold text-[#3D4A3F] hover:bg-[#F4F5F2]"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}

      {!canAssign && (
        <p className="mt-3 text-[12.5px] text-[#7E9182]">
          Maintainers have read-only access to route assignments.
        </p>
      )}
    </>
  );
}
