import Link from "next/link";
import { ConsolePageHeader } from "@/components/console/page-header";
import { RouteChip } from "@/components/console/route-chip";
import type { OperatorCode } from "@/lib/operators";
import { OPERATOR_CODES } from "@/lib/operators";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { getClosedRouteIds, summarizeFare } from "@/lib/transit";
import { AssignSelect } from "./assign-select";
import { RouteFilters } from "./filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function typeLabel(routeType: number, operatorCode: OperatorCode | null) {
  if (routeType === 0) return "LRT";
  if (operatorCode === "MINIBUS") return "Minibus";
  return "Fixed bus";
}

export default async function RouteAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; operator?: string; page?: string }>;
}) {
  const { role } = await requireRole(CONSOLE_ROLES);
  const canAssign = role !== "maintainer";

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

      {/* Mobile: card list */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {routes.map((route) => {
          const operatorCode =
            (route.assignment?.operator.code as OperatorCode | undefined) ??
            null;
          const closed = closedIds.has(route.id);
          return (
            <div
              key={route.id}
              className="flex flex-col gap-2.5 rounded-xl border border-[#E2E6DE] bg-white p-3.5"
            >
              <div className="flex items-center gap-2">
                <RouteChip
                  shortName={route.shortName}
                  operatorCode={operatorCode}
                />
                {closed && (
                  <span className="rounded-full bg-[#FEE2E2] px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-[#991B1B]">
                    CLOSED
                  </span>
                )}
                <span className="ml-auto text-[11.5px] text-[#7E9182]">
                  {typeLabel(route.type, operatorCode)}
                  {route.lengthMeters
                    ? ` · ${(route.lengthMeters / 1000).toFixed(1)} km`
                    : ""}
                </span>
              </div>
              <div className="text-[13.5px] leading-snug font-medium text-[#1C2321]">
                {route.longName}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] whitespace-nowrap text-[#5C6B5E]">
                  {summarizeFare(route.fare)?.label ?? "No fare set"}
                </span>
                <AssignSelect
                  routeId={route.id}
                  shortName={route.shortName}
                  operatorId={route.assignment?.operatorId ?? null}
                  operators={operators}
                  disabled={!canAssign}
                />
              </div>
            </div>
          );
        })}
        {routes.length === 0 && (
          <div className="rounded-xl border border-[#E2E6DE] bg-white p-8 text-center text-[13.5px] text-[#5C6B5E]">
            No routes match your search.
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E6DE] bg-white max-md:hidden">
        <div className="grid min-w-225 grid-cols-[100px_1.7fr_86px_64px_150px_190px] items-center gap-3 border-b border-[#E2E6DE] bg-[#F8FAF6] px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
          <span>Route</span>
          <span>Corridor</span>
          <span>Type</span>
          <span>Km</span>
          <span>Fare</span>
          <span>Operating agency</span>
        </div>
        {routes.map((route) => {
          const operatorCode =
            (route.assignment?.operator.code as OperatorCode | undefined) ??
            null;
          const closed = closedIds.has(route.id);
          return (
            <div
              key={route.id}
              className="grid min-w-225 grid-cols-[100px_1.7fr_86px_64px_150px_190px] items-center gap-3 border-b border-[#EEF1EA] px-5 py-2.5 text-[13.5px] last:border-b-0"
            >
              <span className="justify-self-start">
                <RouteChip shortName={route.shortName} operatorCode={operatorCode} />
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-medium text-[#1C2321]">
                  {route.longName}
                </span>
                {closed && (
                  <span className="rounded-full bg-[#FEE2E2] px-1.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-[#991B1B]">
                    CLOSED
                  </span>
                )}
              </span>
              <span className="text-[12.5px] text-[#5C6B5E]">
                {typeLabel(route.type, operatorCode)}
              </span>
              <span className="text-[#5C6B5E] tabular-nums">
                {route.lengthMeters
                  ? (route.lengthMeters / 1000).toFixed(1)
                  : "—"}
              </span>
              <span className="text-[12.5px] text-[#5C6B5E]">
                {summarizeFare(route.fare)?.label ?? "—"}
              </span>
              <AssignSelect
                routeId={route.id}
                shortName={route.shortName}
                operatorId={route.assignment?.operatorId ?? null}
                operators={operators}
                disabled={!canAssign}
              />
            </div>
          );
        })}
        {routes.length === 0 && (
          <div className="p-8 text-center text-[13.5px] text-[#5C6B5E]">
            No routes match your search.
          </div>
        )}
      </div>

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
