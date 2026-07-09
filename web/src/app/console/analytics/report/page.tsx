import Link from "next/link";
import {
  ClosuresChart,
  FareChart,
  HeadwayChart,
  OperatorRoutesChart,
} from "@/components/console/charts";
import { computeNetworkAnalytics } from "@/lib/analytics";
import { CONSOLE_ROLES } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Print-optimized network performance report. "Save as PDF" comes free via
 * the browser print dialog; the console chrome carries `print:hidden`.
 */
export default async function AnalyticsReportPage() {
  const { session } = await requireRole(CONSOLE_ROLES);
  const analytics = await computeNetworkAnalytics();
  const { kpis } = analytics;
  const generated = new Date(analytics.generatedAt);

  const kpiRows: [string, string][] = [
    ["Routes in network", String(kpis.routes)],
    ["Network length", `${kpis.networkKm.toLocaleString()} km`],
    ["Stops", kpis.stops.toLocaleString()],
    [
      "Average headway",
      kpis.avgHeadwayMin ? `${Math.round(kpis.avgHeadwayMin)} min` : "—",
    ],
    [
      "Average service span",
      kpis.avgServiceSpanH ? `${kpis.avgServiceSpanH.toFixed(1)} h/day` : "—",
    ],
    ["Routes closed right now", String(kpis.closedNow)],
    ["Closure-days (last 90 days)", String(kpis.closureDays90)],
    [
      "Estimated daily seat-km (modeled)",
      kpis.estDailySeatKm.toLocaleString(),
    ],
  ];

  return (
    <div className="mx-auto max-w-195 print:max-w-none">
      {/* Screen-only toolbar */}
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/console/analytics"
          className="text-[13px] font-semibold text-[#15803D] hover:underline"
        >
          ← Back to analytics
        </Link>
        <PrintButton />
      </div>

      {/* Report header */}
      <header className="mb-6 border-b-2 border-[#152018] pb-4">
        <div className="font-mono text-[11px] font-semibold tracking-widest text-[#15803D]">
          MENGED · ADDIS ABABA TRANSIT
        </div>
        <h1 className="mt-1 text-[26px] font-bold text-[#1C2321]">
          Network Performance Report
        </h1>
        <div className="mt-1 text-[12.5px] text-[#5C6B5E]">
          Generated {generated.toLocaleString()} · Prepared by{" "}
          {session.user.name} · Source: GTFS 2026 (DT4A) + operations data
        </div>
      </header>

      {/* KPI table */}
      <section className="mb-7">
        <h2 className="mb-2.5 text-[15px] font-bold text-[#1C2321]">
          Network at a glance
        </h2>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {kpiRows.map(([label, value]) => (
              <tr key={label} className="border-b border-[#EEF1EA]">
                <td className="py-1.5 pr-4 text-[#5C6B5E]">{label}</td>
                <td className="py-1.5 text-right font-semibold text-[#1C2321] tabular-nums">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Operator summary table */}
      <section className="mb-7">
        <h2 className="mb-2.5 text-[15px] font-bold text-[#1C2321]">
          Operator summary
        </h2>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-[#152018] text-left text-[11px] tracking-wide text-[#5C6B5E] uppercase">
              <th className="py-1.5 pr-3">Operator</th>
              <th className="py-1.5 pr-3 text-right">Routes</th>
              <th className="py-1.5 pr-3 text-right">Network km</th>
              <th className="py-1.5 pr-3 text-right">Avg headway</th>
              <th className="py-1.5 pr-3 text-right">Avg fare</th>
              <th className="py-1.5 pr-3 text-right">Est. daily capacity</th>
              <th className="py-1.5 text-right">Closed now</th>
            </tr>
          </thead>
          <tbody>
            {analytics.operators.map((op) => (
              <tr key={op.code} className="border-b border-[#EEF1EA]">
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: op.color }}
                    />
                    <span className="font-medium text-[#1C2321]">
                      {op.name}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {op.routes}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {op.networkKm.toLocaleString()}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {op.avgHeadwayMin ? `${Math.round(op.avgHeadwayMin)} min` : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {op.avgFareEtb ? `${op.avgFareEtb.toFixed(0)} ETB` : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {op.estDailyCapacity.toLocaleString()}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {op.closedNow}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Charts, two per row on screen, stacked cleanly in print */}
      <section className="grid grid-cols-2 gap-5 max-md:grid-cols-1 print:grid-cols-2">
        {(
          [
            [
              "Routes and network km by operator",
              <OperatorRoutesChart key="c1" data={analytics.operators} />,
            ],
            [
              "Headway distribution",
              <HeadwayChart key="c2" data={analytics.headwayBuckets} />,
            ],
            [
              "Route closures · last 90 days",
              <ClosuresChart key="c3" data={analytics.closuresByDay} />,
            ],
            [
              "Average fare by operator (ETB)",
              <FareChart key="c4" data={analytics.fareByOperator} />,
            ],
          ] as const
        ).map(([title, chart]) => (
          <div
            key={title}
            className="rounded-xl border border-[#E2E6DE] bg-white p-4 break-inside-avoid"
          >
            <div className="mb-2 text-[13px] font-bold text-[#1C2321]">
              {title}
            </div>
            {chart}
          </div>
        ))}
      </section>

      <footer className="mt-7 border-t border-[#E2E6DE] pt-3 text-[11px] leading-relaxed text-[#7E9182]">
        Capacity and seat-km figures are modeled from scheduled frequencies
        and assumed vehicle sizes (LRT 286 · bus 60 · minibus 12 passengers);
        no ridership feed is connected. Fare averages reflect configured fare
        structures, not collected revenue. Data: DT4A GTFS 2026 feed and
        Menged operations records.
      </footer>
    </div>
  );
}
