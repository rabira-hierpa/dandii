import Link from "next/link";
import { ConsolePageHeader } from "@/components/console/page-header";
import type { OperatorCode } from "@/lib/operators";
import { OPERATOR_CODES } from "@/lib/operators";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { RouteFilters } from "../routes/filters";
import type { FareRowData } from "./fare-row";
import { FaresList } from "./fares-list";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function FareManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; operator?: string; page?: string }>;
}) {
  const { role } = await requireRole(CONSOLE_ROLES);
  const readOnly = role === "maintainer";

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

  const [routes, total] = await Promise.all([
    prisma.route.findMany({
      where,
      select: {
        id: true,
        shortName: true,
        longName: true,
        type: true,
        assignment: {
          select: { operator: { select: { code: true, name: true } } },
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
      },
      orderBy: { shortName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.route.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (operatorFilter) sp.set("operator", operatorFilter);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/console/fares${qs ? `?${qs}` : ""}`;
  };

  const rows: FareRowData[] = routes.map((route) => {
    const operatorCode =
      (route.assignment?.operator.code as OperatorCode | undefined) ?? null;
    return {
      routeId: route.id,
      shortName: route.shortName,
      longName: route.longName,
      operatorCode,
      operatorName: route.assignment?.operator.name ?? "Unassigned",
      typeLabel:
        route.type === 0
          ? "LRT"
          : operatorCode === "MINIBUS"
            ? "Minibus"
            : "Fixed bus",
      kind: route.fare?.kind ?? "FLAT",
      flatAmountEtb: route.fare?.flatAmountEtb?.toNumber() ?? null,
      tiers:
        route.fare?.tiers.map((t) => ({
          label: t.label,
          fromKm: t.fromKm,
          toKm: t.toKm,
          amountEtb: t.amountEtb.toNumber(),
        })) ?? [],
    };
  });

  return (
    <>
      <ConsolePageHeader
        title="Fare Management"
        subtitle="Flat and distance-based pricing in Ethiopian Birr (ETB)"
        action={
          <a
            href="/api/export/fares.csv"
            className="shrink-0 rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-[#3D4A3F] hover:bg-[#F4F5F2]"
          >
            Export CSV
          </a>
        }
      />
      <RouteFilters resultCount={total} />

      <FaresList rows={rows} readOnly={readOnly} />

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

      {readOnly && (
        <p className="mt-3 text-[12.5px] text-[#7E9182]">
          Maintainers have read-only access to fares.
        </p>
      )}
    </>
  );
}
