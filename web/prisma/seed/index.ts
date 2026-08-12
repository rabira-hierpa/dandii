/**
 * GTFS 2026 import pipeline. Idempotent: truncates transit tables (never
 * auth tables) and re-imports from data/gtfs-2026.
 *
 * Operator classification uses the publisher's own sub-feeds as ground
 * truth: routes in the minibus sub-feed are MINIBUS; bus sub-feed routes
 * split by short-name prefix (AB=Anbessa, SH=Sheger, rest=Alliance);
 * route_type 0 is LRT.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../../src/generated/prisma/client";
import type { OperatorCode } from "../../src/generated/prisma/enums";
import { applyOverrides } from "./apply-overrides";
import {
  buildRouteGeometry,
  groupShapes,
  type RouteGeometry,
} from "./build-geojson";
import {
  readGtfsFile,
  type GtfsAgency,
  type GtfsCalendar,
  type GtfsFrequency,
  type GtfsRoute,
  type GtfsShapePoint,
  type GtfsStop,
  type GtfsStopTime,
  type GtfsTrip,
} from "./parse-gtfs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BATCH = 1000;

async function batchedCreate<T>(
  rows: T[],
  create: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await create(rows.slice(i, i + BATCH));
  }
}

const OPERATORS: { code: OperatorCode; name: string; kind: string }[] = [
  { code: "ANBESSA", name: "Anbessa City Bus", kind: "Fixed-route bus" },
  { code: "SHEGER", name: "Sheger Mass Transport", kind: "Fixed-route bus" },
  { code: "ALLIANCE", name: "Alliance City Bus", kind: "Fixed-route bus" },
  {
    code: "MINIBUS",
    name: "Minibus Associations",
    kind: "Demand-responsive paratransit",
  },
  { code: "LRT", name: "Addis Ababa Light Rail", kind: "Light rail transit" },
];

function classifyOperator(
  route: GtfsRoute,
  minibusIds: Set<string>,
): OperatorCode {
  if (route.route_type === "0") return "LRT";
  if (minibusIds.has(route.route_id)) return "MINIBUS";
  if (route.route_short_name.startsWith("AB")) return "ANBESSA";
  if (route.route_short_name.startsWith("SH")) return "SHEGER";
  return "ALLIANCE";
}

/** Design defaults so Fare Management opens populated. All amounts in ETB. */
function defaultFare(code: OperatorCode): {
  kind: "FLAT" | "TIERED";
  flat?: number;
  tiers?: { label: string; fromKm: number; toKm: number | null; amount: number }[];
} {
  switch (code) {
    case "LRT":
      return {
        kind: "TIERED",
        tiers: [
          { label: "0–4 km", fromKm: 0, toKm: 4, amount: 10 },
          { label: "4–8 km", fromKm: 4, toKm: 8, amount: 15 },
          { label: "8+ km", fromKm: 8, toKm: null, amount: 20 },
        ],
      };
    case "MINIBUS":
      return {
        kind: "TIERED",
        tiers: [
          { label: "Short hop", fromKm: 0, toKm: 3, amount: 15 },
          { label: "Mid", fromKm: 3, toKm: 7, amount: 25 },
          { label: "Full corridor", fromKm: 7, toKm: null, amount: 35 },
        ],
      };
    case "ANBESSA":
      return { kind: "FLAT", flat: 10 };
    default: // SHEGER, ALLIANCE
      return { kind: "FLAT", flat: 15 };
  }
}

async function main() {
  console.time("seed");

  console.log("Parsing GTFS files…");
  const agencies = readGtfsFile<GtfsAgency>("combined/agency.txt");
  const routes = readGtfsFile<GtfsRoute>("combined/routes.txt");
  const stops = readGtfsFile<GtfsStop>("combined/stops.txt");
  const trips = readGtfsFile<GtfsTrip>("combined/trips.txt");
  const stopTimes = readGtfsFile<GtfsStopTime>("combined/stop_times.txt");
  const frequencies = readGtfsFile<GtfsFrequency>("combined/frequencies.txt");
  const calendars = readGtfsFile<GtfsCalendar>("combined/calendar.txt");
  const shapePoints = readGtfsFile<GtfsShapePoint>("combined/shapes.txt");
  const minibusIds = new Set(
    readGtfsFile<GtfsRoute>("minibus/routes.txt").map((r) => r.route_id),
  );

  console.log("Building route geometries…");
  const shapes = groupShapes(shapePoints);

  /**
   * Pick the shape the PUBLIC map draws for each route.
   *
   * Routes carry two shapes (444 of 447 do) and the rider map draws one line,
   * so one has to win. Outbound (direction_id 0) is that line — every route in
   * the feed has one, whereas 3 routes have no inbound shape at all.
   *
   * Both shapes are still stored (see the Shape import below); this only
   * decides which one hangs off Route.geojson for riders. The console reads
   * them per direction via /api/geo/routes?directions=both.
   */
  const routeShapeId = new Map<string, string>();
  const routeFallbackShapeId = new Map<string, string>();
  for (const trip of trips) {
    if (!trip.shape_id) continue;
    if (trip.direction_id === "0") {
      if (!routeShapeId.has(trip.route_id)) {
        routeShapeId.set(trip.route_id, trip.shape_id);
      }
    } else if (!routeFallbackShapeId.has(trip.route_id)) {
      routeFallbackShapeId.set(trip.route_id, trip.shape_id);
    }
  }
  for (const [routeId, shapeId] of routeFallbackShapeId) {
    if (!routeShapeId.has(routeId)) routeShapeId.set(routeId, shapeId);
  }

  // --preserve-fares is the DEFAULT (design-review T0). It never deletes
  // routes — `route.deleteMany()` cascades Fare/FareTier/FareProposal/
  // FareChangeLog away (Fare.route is onDelete: Cascade), so a routine reseed
  // during development would silently destroy approved fare corrections.
  // Preserve mode upserts routes, rebuilds only the transit-graph children
  // (which hold no user data), and skips default-fare seeding whenever any
  // Fare row already exists. Pass --destructive for a full wipe + reseed.
  const preserve = !process.argv.includes("--destructive");
  const seedFares = !preserve || (await prisma.fare.count()) === 0;
  console.log(
    preserve
      ? `Preserve mode: keeping fares/proposals/closures${seedFares ? " (none yet — will seed defaults)" : " (skipping default-fare seed)"}`
      : "Destructive mode: full wipe + reseed",
  );

  // Agencies and operators are upserted (never deleted): routes FK the agency,
  // so in preserve mode we cannot truncate it while routes still exist.
  for (const a of agencies) {
    await prisma.agency.upsert({
      where: { id: a.agency_id },
      create: {
        id: a.agency_id,
        name: a.agency_name,
        url: a.agency_url || null,
        timezone: a.agency_timezone || null,
      },
      update: {
        name: a.agency_name,
        url: a.agency_url || null,
        timezone: a.agency_timezone || null,
      },
    });
  }
  for (const op of OPERATORS) {
    await prisma.operator.upsert({
      where: { code: op.code },
      create: op,
      update: { name: op.name, kind: op.kind },
    });
  }
  const operatorIdByCode = new Map(
    (await prisma.operator.findMany()).map((o) => [o.code, o.id]),
  );

  // Transit-graph children hold no user data — always rebuilt. Deleting trips
  // cascades their stop_times and frequencies; deleting a route (destructive
  // only) cascades its fares/proposals/closures/assignment.
  console.log("Rebuilding transit-graph tables…");
  await prisma.routeAssignment.deleteMany();
  await prisma.frequency.deleteMany();
  await prisma.stopTime.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.calendar.deleteMany();
  await prisma.shape.deleteMany();
  // Feed-owned rows only. Stops an operator created in the console have no
  // base-feed row to be reloaded from, so wiping them here would destroy the
  // edit permanently — the reseed would have nothing to put back.
  await prisma.stop.deleteMany({ where: { origin: "FEED" } });
  if (!preserve) {
    await prisma.routeClosure.deleteMany();
    await prisma.fareTier.deleteMany();
    await prisma.fare.deleteMany();
    await prisma.route.deleteMany({ where: { origin: "FEED" } });
  }

  // Every shape, not just the rider-facing one — the console draws both
  // directions and the shape editor needs each line addressable by shape_id.
  console.log(`Importing ${shapes.size} shapes…`);
  const shapeRows = [...shapes]
    .map(([id, coords]) => {
      const geometry = buildRouteGeometry(coords);
      return geometry ? { id, geometry } : null;
    })
    .filter((row): row is { id: string; geometry: RouteGeometry } => row !== null);
  await batchedCreate(shapeRows, (chunk) =>
    prisma.shape.createMany({
      data: chunk.map((s) => ({
        id: s.id,
        geojson: s.geometry.geojson as unknown as Prisma.InputJsonValue,
        geojsonSimplified: s.geometry
          .geojsonSimplified as unknown as Prisma.InputJsonValue,
        lengthMeters: s.geometry.lengthMeters,
      })),
      skipDuplicates: true,
    }),
  );

  console.log("Importing stops…");
  await batchedCreate(stops, (chunk) =>
    prisma.stop.createMany({
      data: chunk.map((s) => ({
        id: s.stop_id,
        name: s.stop_name,
        lat: Number(s.stop_lat),
        lon: Number(s.stop_lon),
      })),
      skipDuplicates: true,
    }),
  );

  console.log("Importing routes…");
  const routeOperator = new Map<string, OperatorCode>();
  // Upsert (not createMany): preserves existing routes and their fares while
  // inserting new ones and updating changed metadata. Never deletes a route,
  // so a reseed can't cascade approved fares away. ~450 upserts, ~2s.
  for (const r of routes) {
    const code = classifyOperator(r, minibusIds);
    routeOperator.set(r.route_id, code);
    const shapeId = routeShapeId.get(r.route_id);
    const coords = shapeId ? shapes.get(shapeId) : undefined;
    const geometry = coords ? buildRouteGeometry(coords) : null;
    const fields = {
      shortName: r.route_short_name,
      longName: r.route_long_name,
      type: Number(r.route_type),
      color: r.route_color || null,
      textColor: r.route_text_color || null,
      agencyId: r.agency_id,
      geojson: geometry
        ? (geometry.geojson as unknown as Prisma.InputJsonValue)
        : undefined,
      geojsonSimplified: geometry
        ? (geometry.geojsonSimplified as unknown as Prisma.InputJsonValue)
        : undefined,
      lengthMeters: geometry?.lengthMeters ?? null,
    };
    await prisma.route.upsert({
      where: { id: r.route_id },
      create: { id: r.route_id, ...fields },
      update: fields,
    });
  }

  console.log("Importing calendar, trips, stop times, frequencies…");
  await prisma.calendar.createMany({
    data: calendars.map((c) => ({
      serviceId: c.service_id,
      monday: c.monday === "1",
      tuesday: c.tuesday === "1",
      wednesday: c.wednesday === "1",
      thursday: c.thursday === "1",
      friday: c.friday === "1",
      saturday: c.saturday === "1",
      sunday: c.sunday === "1",
      startDate: c.start_date,
      endDate: c.end_date,
    })),
  });
  await batchedCreate(trips, (chunk) =>
    prisma.trip.createMany({
      data: chunk.map((t) => ({
        id: t.trip_id,
        routeId: t.route_id,
        serviceId: t.service_id,
        shapeId: t.shape_id || null,
        directionId: t.direction_id === "" ? null : Number(t.direction_id),
        headsign: t.trip_headsign || null,
      })),
      skipDuplicates: true,
    }),
  );
  const validStopIds = new Set(stops.map((s) => s.stop_id));
  await batchedCreate(
    stopTimes.filter((st) => validStopIds.has(st.stop_id)),
    (chunk) =>
      prisma.stopTime.createMany({
        data: chunk.map((st) => ({
          tripId: st.trip_id,
          stopId: st.stop_id,
          sequence: Number(st.stop_sequence),
          arrival: st.arrival_time || null,
          departure: st.departure_time || null,
        })),
        skipDuplicates: true,
      }),
  );
  await batchedCreate(frequencies, (chunk) =>
    prisma.frequency.createMany({
      data: chunk.map((f) => {
        const toSecs = (t: string) => {
          const [h, m, s] = t.split(":").map(Number);
          return h * 3600 + m * 60 + s;
        };
        const window = toSecs(f.end_time) - toSecs(f.start_time);
        const headway = Math.min(Number(f.headway_secs), Math.max(window, 60));
        return {
          tripId: f.trip_id,
          startTime: f.start_time,
          endTime: f.end_time,
          headwaySecs: headway,
        };
      }),
    }),
  );

  console.log("Assigning operators…");
  await batchedCreate([...routeOperator.entries()], (chunk) =>
    prisma.routeAssignment.createMany({
      data: chunk.map(([routeId, code]) => ({
        routeId,
        operatorId: operatorIdByCode.get(code)!,
      })),
    }),
  );

  if (seedFares) {
    console.log("Seeding default fares…");
    for (const [routeId, code] of routeOperator) {
      const fare = defaultFare(code);
      await prisma.fare.create({
        data: {
          routeId,
          kind: fare.kind,
          flatAmountEtb: fare.flat,
          tiers: fare.tiers
            ? {
                create: fare.tiers.map((t) => ({
                  label: t.label,
                  fromKm: t.fromKm,
                  toKm: t.toKm,
                  amountEtb: t.amount,
                })),
              }
            : undefined,
        },
      });
    }
  } else {
    console.log("Skipping default-fare seed (existing fares preserved).");
  }

  // Last step, deliberately: the import above reloads the feed verbatim and
  // would otherwise discard every console correction. Replaying overrides here
  // makes a reseed reproduce the edited state rather than the raw feed.
  console.log("Re-applying operator overrides…");
  const overrides = await applyOverrides(prisma);
  console.log(
    `  ${overrides.stopsRenamed} stops renamed, ${overrides.routesEdited} routes edited, ` +
      `${overrides.operatorsReassigned} operators reassigned` +
      (overrides.stopsDeleted + overrides.routesDeleted > 0
        ? `, ${overrides.stopsDeleted} stops and ${overrides.routesDeleted} routes deleted ` +
          `(${overrides.stopTimesRemoved} stop_times went with them)`
        : "") +
      (overrides.skipped > 0
        ? `, ${overrides.skipped} kept but not applied (id absent from this feed)`
        : ""),
  );

  const counts = {
    agencies: await prisma.agency.count(),
    operators: await prisma.operator.count(),
    routes: await prisma.route.count(),
    stops: await prisma.stop.count(),
    shapes: await prisma.shape.count(),
    trips: await prisma.trip.count(),
    stopTimes: await prisma.stopTime.count(),
    frequencies: await prisma.frequency.count(),
    fares: await prisma.fare.count(),
    assignments: await prisma.routeAssignment.count(),
  };
  console.log(counts);
  const byOperator = await prisma.routeAssignment.groupBy({
    by: ["operatorId"],
    _count: true,
  });
  for (const g of byOperator) {
    const op = OPERATORS.find(
      (o) => operatorIdByCode.get(o.code) === g.operatorId,
    );
    console.log(`  ${op?.code}: ${g._count} routes`);
  }
  console.timeEnd("seed");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
