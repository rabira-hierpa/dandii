import Link from "next/link";
import {
  ClosuresChart,
  FareChart,
  HeadwayChart,
  OperatorRoutesChart,
} from "@/components/console/charts";
import { ConsolePageHeader } from "@/components/console/page-header";
import { computeNetworkAnalytics } from "@/lib/analytics";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

function ChartCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#E2E6DE] bg-white p-4">
      <div className="mb-3">
        <div className="text-[13.5px] font-bold text-[#1C2321]">{title}</div>
        {note && <div className="text-[11.5px] text-[#7E9182]">{note}</div>}
      </div>
      {children}
    </div>
  );
}

export default async function AnalyticsPage() {
  await requireRole(CONSOLE_ROLES);
  const analytics = await computeNetworkAnalytics();
  const { kpis } = analytics;

  const kpiCards = [
    { label: "Network length", value: `${kpis.networkKm.toLocaleString()} km` },
    { label: "Routes", value: String(kpis.routes) },
    { label: "Stops", value: kpis.stops.toLocaleString() },
    {
      label: "Avg headway",
      value: kpis.avgHeadwayMin ? `${Math.round(kpis.avgHeadwayMin)} min` : "—",
    },
    {
      label: "Avg service span",
      value: kpis.avgServiceSpanH
        ? `${kpis.avgServiceSpanH.toFixed(1)} h/day`
        : "—",
    },
    {
      label: "Closed right now",
      value: String(kpis.closedNow),
      alert: kpis.closedNow > 0,
    },
    { label: "Closure-days · 90d", value: String(kpis.closureDays90) },
    {
      label: "Est. daily seat-km",
      value:
        kpis.estDailySeatKm >= 1_000_000
          ? `${(kpis.estDailySeatKm / 1_000_000).toFixed(1)} M`
          : kpis.estDailySeatKm.toLocaleString(),
      note: "modeled",
    },
  ];

  return (
    <>
      <ConsolePageHeader
        title="Analytics"
        subtitle="Service supply, disruption, and fare structure across the network"
        action={
          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href="/api/export/routes.csv"
              className="rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-[#3D4A3F] hover:bg-[#F4F5F2]"
            >
              Routes + fares CSV
            </a>
            <a
              href="/api/export/closures.csv"
              className="rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-[#3D4A3F] hover:bg-[#F4F5F2]"
            >
              Closures CSV
            </a>
            <Link
              href="/console/analytics/report"
              className="rounded-lg bg-[#152018] px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-white hover:bg-[#24352A]"
            >
              Generate report
            </Link>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-[#E2E6DE] bg-white px-4 py-3.5"
          >
            <div className="text-[10.5px] font-semibold tracking-wider text-[#5C6B5E] uppercase">
              {kpi.label}
              {kpi.note && (
                <span className="ml-1 rounded bg-[#FEF3C7] px-1 py-px text-[9.5px] text-[#92400E] normal-case">
                  {kpi.note}
                </span>
              )}
            </div>
            <div
              className="mt-1 text-[22px] font-bold tabular-nums"
              style={{ color: kpi.alert ? "#B91C1C" : "#1C2321" }}
            >
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <ChartCard
          title="Routes and network km by operator"
          note="supply share per agency"
        >
          <OperatorRoutesChart data={analytics.operators} />
        </ChartCard>
        <ChartCard
          title="Headway distribution"
          note="scheduled frequency across all routes — shorter is better"
        >
          <HeadwayChart data={analytics.headwayBuckets} />
        </ChartCard>
        <ChartCard
          title="Route closures · last 90 days"
          note="routes closed per day, stacked by reason"
        >
          <ClosuresChart data={analytics.closuresByDay} />
        </ChartCard>
        <ChartCard
          title="Average fare by operator"
          note="mean across each operator's fare structures (ETB)"
        >
          <FareChart data={analytics.fareByOperator} />
        </ChartCard>
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-[#7E9182]">
        Capacity figures are modeled from scheduled frequencies and assumed
        vehicle sizes (LRT 286 · bus 60 · minibus 12 passengers); no ridership
        feed is connected yet. Generated{" "}
        {new Date(analytics.generatedAt).toLocaleString()}.
      </p>
    </>
  );
}
