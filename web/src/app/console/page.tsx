import { getTranslations } from "next-intl/server";
import { ConsolePageHeader } from "@/components/console/page-header";
import { OPERATOR_META, type OperatorCode } from "@/lib/operators";
import { prisma } from "@/lib/prisma";
import { activeClosureFilter, getClosedRouteIds } from "@/lib/transit";

export const dynamic = "force-dynamic";

export default async function ConsoleOverviewPage() {
  const t = await getTranslations("console");
  const now = new Date();
  const [operators, routeCount, stopCount, tripCount, closedIds, closures] =
    await Promise.all([
      prisma.operator.findMany({
        include: {
          assignments: {
            select: {
              route: {
                select: {
                  id: true,
                  lengthMeters: true,
                  fare: {
                    select: {
                      kind: true,
                      flatAmountEtb: true,
                      tiers: { select: { amountEtb: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.route.count(),
      prisma.stop.count(),
      prisma.trip.count(),
      getClosedRouteIds(now),
      prisma.routeClosure.count({ where: activeClosureFilter(now) }),
    ]);

  const kpis = [
    {
      label: "Active operators",
      value: String(operators.length),
      note: "3 modes · bus, LRT, paratransit",
    },
    {
      label: "Routes in service",
      value: String(routeCount - closedIds.size),
      note:
        closedIds.size > 0
          ? `${closedIds.size} closed right now (${closures} active closures)`
          : "from routes.txt · GTFS 2026",
    },
    {
      label: "Stops · Trips",
      value: `${stopCount.toLocaleString()} · ${tripCount}`,
      note: "network-wide, frequency-based service",
    },
  ];

  const cards = operators
    .map((op) => {
      const meta = OPERATOR_META[op.code as OperatorCode];
      const routes = op.assignments.map((a) => a.route);
      const closedHere = routes.filter((r) => closedIds.has(r.id)).length;
      const kmTotal = routes.reduce(
        (sum, r) => sum + (r.lengthMeters ?? 0) / 1000,
        0,
      );
      const prices = routes.flatMap((r) =>
        r.fare
          ? r.fare.kind === "FLAT"
            ? [r.fare.flatAmountEtb?.toNumber() ?? 0]
            : r.fare.tiers.map((t) => t.amountEtb.toNumber())
          : [],
      );
      const allFlatSame =
        routes.length > 0 &&
        routes.every(
          (r) =>
            r.fare?.kind === "FLAT" &&
            r.fare.flatAmountEtb?.toNumber() ===
              routes[0].fare?.flatAmountEtb?.toNumber(),
        );
      const fareSummary =
        prices.length === 0
          ? "—"
          : allFlatSame
            ? `Flat ${routes[0].fare?.flatAmountEtb?.toNumber()} ETB`
            : `${Math.min(...prices)}–${Math.max(...prices)} ETB`;
      const pct = routeCount
        ? Math.round((routes.length / routeCount) * 100)
        : 0;
      return {
        meta,
        name: op.name,
        kind: op.kind,
        routeCount: routes.length,
        closedHere,
        kmTotal,
        fareSummary,
        pct,
      };
    })
    .sort((a, b) => b.routeCount - a.routeCount);

  return (
    <>
      <ConsolePageHeader
        title={t("overview.title")}
        subtitle={t("overview.subtitle")}
      />

      <div className="mb-5 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-[#E2E6DE] bg-white px-5 py-4.5"
          >
            <div className="text-xs font-semibold tracking-wider text-[#5C6B5E] uppercase">
              {k.label}
            </div>
            <div className="mt-1.5 text-3xl font-bold text-[#1C2321] tabular-nums">
              {k.value}
            </div>
            <div className="mt-0.5 text-[12.5px] text-[#5C6B5E]">{k.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {cards.map((card) => (
          <div
            key={card.meta.code}
            className="flex flex-col gap-3.5 rounded-xl border border-[#E2E6DE] bg-white p-5"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-8.5 w-3 shrink-0 rounded"
                style={{ background: card.meta.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-[#1C2321]">
                  {card.name}
                </div>
                <div className="text-xs text-[#5C6B5E]">
                  {card.kind} · {card.meta.code}
                </div>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap"
                style={
                  card.closedHere === 0
                    ? { background: "#DCFCE7", color: "#166534" }
                    : { background: "#FEF3C7", color: "#92400E" }
                }
              >
                {card.closedHere === 0
                  ? "Operational"
                  : `${card.closedHere} route${card.closedHere > 1 ? "s" : ""} closed`}
              </span>
            </div>

            <div className="flex items-baseline gap-7">
              <div>
                <div className="text-[26px] font-bold text-[#1C2321] tabular-nums">
                  {card.routeCount}
                </div>
                <div className="text-xs text-[#5C6B5E]">routes managed</div>
              </div>
              <div>
                <div className="text-[26px] font-bold text-[#1C2321] tabular-nums">
                  {Math.round(card.kmTotal).toLocaleString()}
                </div>
                <div className="text-xs text-[#5C6B5E]">network km</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-sm font-semibold text-[#1C2321]">
                  {card.fareSummary}
                </div>
                <div className="text-xs text-[#5C6B5E]">fare structure</div>
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[11.5px] text-[#5C6B5E]">
                <span>share of network routes</span>
                <span>{card.pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#EEF1EA]">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: card.meta.color,
                    width: `${card.pct}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
