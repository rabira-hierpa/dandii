import { csvResponse, requireExportAccess, toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

/**
 * Normalized fare table: one row per tier (flat fares export a single
 * "Flat" row), suitable for spreadsheet analysis and re-import.
 */
export async function GET() {
  const denied = await requireExportAccess();
  if (denied) return denied;

  const fares = await prisma.fare.findMany({
    select: {
      kind: true,
      flatAmountEtb: true,
      currency: true,
      updatedAt: true,
      tiers: {
        select: { label: true, fromKm: true, toKm: true, amountEtb: true },
        orderBy: { fromKm: "asc" },
      },
      route: {
        select: {
          id: true,
          shortName: true,
          longName: true,
          lengthMeters: true,
          assignment: {
            select: { operator: { select: { code: true, name: true } } },
          },
        },
      },
    },
    orderBy: { route: { shortName: "asc" } },
  });

  const header = [
    "route_id",
    "short_name",
    "long_name",
    "operator_code",
    "operator_name",
    "route_length_km",
    "fare_kind",
    "tier_label",
    "from_km",
    "to_km",
    "amount_etb",
    "currency",
    "updated_at",
  ];

  const rows: unknown[][] = [];
  for (const fare of fares) {
    const base = [
      fare.route.id,
      fare.route.shortName,
      fare.route.longName,
      fare.route.assignment?.operator.code ?? "",
      fare.route.assignment?.operator.name ?? "",
      fare.route.lengthMeters
        ? (fare.route.lengthMeters / 1000).toFixed(2)
        : "",
      fare.kind,
    ];
    if (fare.kind === "FLAT") {
      rows.push([
        ...base,
        "Flat",
        "",
        "",
        fare.flatAmountEtb?.toNumber() ?? "",
        fare.currency,
        fare.updatedAt.toISOString(),
      ]);
    } else {
      for (const tier of fare.tiers) {
        rows.push([
          ...base,
          tier.label,
          tier.fromKm,
          tier.toKm ?? "",
          tier.amountEtb.toNumber(),
          fare.currency,
          fare.updatedAt.toISOString(),
        ]);
      }
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`menged-fares-${stamp}.csv`, toCsv(header, rows));
}
