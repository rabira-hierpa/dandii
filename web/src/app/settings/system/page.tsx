import { SETTINGS_ROLES } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SystemSettingsPage() {
  await requireRole(SETTINGS_ROLES);

  const [agency, routes, stops, trips, frequencies, operators, users] =
    await Promise.all([
      prisma.agency.findFirst(),
      prisma.route.count(),
      prisma.stop.count(),
      prisma.trip.count(),
      prisma.frequency.count(),
      prisma.operator.count(),
      prisma.user.count(),
    ]);

  const rows = [
    { label: "GTFS feed", value: "DT4A · et-addisababa 2026" },
    { label: "Feed agency", value: agency?.name ?? "—" },
    { label: "Timezone", value: agency?.timezone ?? "—" },
    { label: "Routes", value: routes.toLocaleString() },
    { label: "Stops", value: stops.toLocaleString() },
    { label: "Trips", value: trips.toLocaleString() },
    { label: "Frequency entries", value: frequencies.toLocaleString() },
    { label: "Operators", value: operators.toLocaleString() },
    { label: "Registered users", value: users.toLocaleString() },
    {
      label: "Journey planner",
      value: process.env.OTP_URL ?? "http://localhost:8080",
    },
  ];

  return (
    <div>
      <h1 className="text-lg font-bold text-[#1C2321]">System</h1>
      <p className="mt-1 text-[13px] text-[#5C6B5E]">
        Data sources and network statistics. Re-run{" "}
        <code className="rounded bg-[#EEF1EA] px-1 py-0.5 font-mono text-[11.5px]">
          npm run db:seed
        </code>{" "}
        after updating the GTFS feed in <code className="rounded bg-[#EEF1EA] px-1 py-0.5 font-mono text-[11.5px]">data/gtfs-2026</code>.
      </p>
      <div className="mt-5 divide-y divide-[#EEF1EA] rounded-xl border border-[#E2E6DE] bg-white">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-4 px-5 py-3">
            <span className="w-44 text-[12.5px] font-semibold text-[#5C6B5E]">
              {row.label}
            </span>
            <span className="font-mono text-[12.5px] text-[#1C2321]">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
