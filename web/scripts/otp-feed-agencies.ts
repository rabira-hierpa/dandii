/**
 * Rewrites a GTFS feed's agency.txt + routes.txt so each route's agency_id is
 * its OPERATOR (Anbessa / Sheger / Minibus / Alliance / LRT), read from the
 * seeded DB (the authoritative classification). The DT4A feed ships a single
 * "AA" agency, which prevents OTP from ranking or filtering directions by
 * operator. Giving each operator its own agency_id lets OTP prefer/ban by
 * agency natively.
 *
 * Usage: npx tsx scripts/otp-feed-agencies.ts <extracted-feed-dir>
 * Then re-zip the dir into otp-data/ and rebuild the OTP graph.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { OPERATOR_META, type OperatorCode } from "@/lib/operators";
import { prisma } from "@/lib/prisma";

const FALLBACK_AGENCY = "AA";
const FALLBACK_NAME = "Addis Ababa Transport (other)";

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: otp-feed-agencies.ts <extracted-feed-dir>");
    process.exit(2);
  }

  // route_id -> operator code (null when a route has no operator assignment).
  const routes = await prisma.route.findMany({
    select: { id: true, assignment: { select: { operator: { select: { code: true } } } } },
  });
  const opById = new Map<string, string>();
  for (const r of routes) {
    const code = r.assignment?.operator.code;
    if (code) opById.set(r.id, code);
  }

  // Rewrite routes.txt: set agency_id per route (fallback AA when unassigned).
  const routesPath = path.join(dir, "routes.txt");
  const parsedRoutes = Papa.parse<Record<string, string>>(
    readFileSync(routesPath, "utf8"),
    { header: true, skipEmptyLines: true },
  );
  const used = new Set<string>();
  for (const row of parsedRoutes.data) {
    const agency = opById.get(row.route_id) ?? FALLBACK_AGENCY;
    row.agency_id = agency;
    used.add(agency);
  }
  writeFileSync(routesPath, Papa.unparse(parsedRoutes.data, { columns: parsedRoutes.meta.fields }));

  // Rewrite agency.txt: one row per operator that appears, same metadata.
  const agencyRows = [...used].sort().map((code) => ({
    agency_id: code,
    agency_name:
      code === FALLBACK_AGENCY
        ? FALLBACK_NAME
        : OPERATOR_META[code as OperatorCode].name,
    agency_url: "https://addismaptransit.com/",
    agency_lang: "en",
    agency_timezone: "Africa/Addis_Ababa",
  }));
  writeFileSync(
    path.join(dir, "agency.txt"),
    Papa.unparse(agencyRows, {
      columns: ["agency_name", "agency_url", "agency_lang", "agency_timezone", "agency_id"],
    }),
  );

  console.log(
    `agencies written: ${[...used].sort().join(", ")} | routes tagged: ${parsedRoutes.data.length}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
