/**
 * Recompute `geojsonSimplified` for every route and shape at the current
 * SIMPLIFY_TOLERANCE, without reloading the feed.
 *
 * Both maps render `geojsonSimplified`, and it was built at a tolerance of
 * ~11 m. Measured over 58 shapes and 10,406 points, that kept 12% of each
 * shape's vertices and put the drawn line up to 13.8 m off the road — visible
 * from zoom 15 as route lines cutting straight across roundabouts. The seed
 * constant is now ~1.1 m, and this replays it over the geometry already in the
 * database.
 *
 * A reseed would do the same thing, but it reloads the vendored feed and
 * re-applies every operator override on the way through. This only rewrites one
 * column from another column in the same row, so there is nothing for it to
 * lose.
 *
 * **Rows carrying a ShapeOverride are skipped.** `saveRouteShape` writes the
 * snapped line to BOTH `geojson` and `geojsonSimplified`, so an operator-drawn
 * shape is already exact. Re-simplifying it would introduce error into the one
 * geometry in the system that has none, and would do it silently to work
 * somebody verified against the road network by hand.
 *
 * Idempotent: re-running writes the same values.
 *
 * Usage:  npx tsx --env-file-if-exists=.env scripts/backfill-simplified.ts [--dry-run]
 */
import { buildRouteGeometry } from "@/../prisma/seed/build-geojson";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");

interface Tally {
  rewritten: number;
  skippedOverride: number;
  skippedShort: number;
  pointsBefore: number;
  pointsAfter: number;
}

const empty = (): Tally => ({
  rewritten: 0,
  skippedOverride: 0,
  skippedShort: 0,
  pointsBefore: 0,
  pointsAfter: 0,
});

/** Coordinates of a stored LineString, or null when the row has no usable line. */
export function lineCoordinates(value: unknown): [number, number][] | null {
  const coords = (value as { coordinates?: unknown } | null)?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords as [number, number][];
}

/**
 * The simplified line for a stored geometry, or null when the row should be
 * left alone. Pure, so the decision is testable without a database.
 */
export function resimplify(
  geojson: unknown,
): { coordinates: [number, number][]; before: number } | null {
  const coords = lineCoordinates(geojson);
  if (!coords) return null;
  const built = buildRouteGeometry(coords);
  if (!built) return null;
  return {
    coordinates: built.geojsonSimplified.coordinates as [number, number][],
    before: coords.length,
  };
}

async function backfillShapes(overriddenShapeIds: Set<string>): Promise<Tally> {
  const tally = empty();
  const shapes = await prisma.shape.findMany({
    select: { id: true, geojson: true, geojsonSimplified: true },
  });

  for (const shape of shapes) {
    if (overriddenShapeIds.has(shape.id)) {
      tally.skippedOverride++;
      continue;
    }
    const next = resimplify(shape.geojson);
    if (!next) {
      tally.skippedShort++;
      continue;
    }
    const beforePts = lineCoordinates(shape.geojsonSimplified)?.length ?? 0;
    tally.pointsBefore += beforePts;
    tally.pointsAfter += next.coordinates.length;
    tally.rewritten++;

    if (!DRY_RUN) {
      await prisma.shape.update({
        where: { id: shape.id },
        data: {
          geojsonSimplified: {
            type: "LineString",
            coordinates: next.coordinates,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
  return tally;
}

async function backfillRoutes(overriddenRouteIds: Set<string>): Promise<Tally> {
  const tally = empty();
  const routes = await prisma.route.findMany({
    select: { id: true, geojson: true, geojsonSimplified: true },
  });

  for (const route of routes) {
    // Route.geojson mirrors the outbound drawn shape (see saveRouteShape), so
    // a route whose outbound direction was drawn is exact for the same reason.
    if (overriddenRouteIds.has(route.id)) {
      tally.skippedOverride++;
      continue;
    }
    const next = resimplify(route.geojson);
    if (!next) {
      tally.skippedShort++;
      continue;
    }
    const beforePts = lineCoordinates(route.geojsonSimplified)?.length ?? 0;
    tally.pointsBefore += beforePts;
    tally.pointsAfter += next.coordinates.length;
    tally.rewritten++;

    if (!DRY_RUN) {
      await prisma.route.update({
        where: { id: route.id },
        data: {
          geojsonSimplified: {
            type: "LineString",
            coordinates: next.coordinates,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
  return tally;
}

function report(label: string, t: Tally): void {
  const avgBefore = t.rewritten ? (t.pointsBefore / t.rewritten).toFixed(0) : "0";
  const avgAfter = t.rewritten ? (t.pointsAfter / t.rewritten).toFixed(0) : "0";
  console.log(
    `${label}: ${t.rewritten} rewritten (${avgBefore} -> ${avgAfter} pts avg), ` +
      `${t.skippedOverride} skipped (operator-drawn), ${t.skippedShort} skipped (no line)`,
  );
}

async function main() {
  if (DRY_RUN) console.log("DRY RUN — nothing is written\n");

  // Every direction an operator has drawn. The Shape rows those trips point at
  // already hold the exact snapped line in both columns.
  const overrides = await prisma.shapeOverride.findMany({
    select: { routeId: true, directionId: true },
  });
  const overriddenRouteIds = new Set(
    overrides.filter((o) => o.directionId === 0).map((o) => o.routeId),
  );
  const overriddenShapeIds = new Set(
    (
      await prisma.trip.findMany({
        where: {
          OR: overrides.map((o) => ({
            routeId: o.routeId,
            directionId: o.directionId,
          })),
          shapeId: { not: null },
        },
        select: { shapeId: true },
      })
    ).map((t) => t.shapeId as string),
  );

  console.log(
    `Protecting ${overriddenShapeIds.size} operator-drawn shapes across ${overrides.length} edited directions\n`,
  );

  report("Routes", await backfillRoutes(overriddenRouteIds));
  report("Shapes", await backfillShapes(overriddenShapeIds));

  await prisma.$disconnect();
}

// Only run when invoked directly, so the pure helpers above stay importable.
if (process.argv[1]?.endsWith("backfill-simplified.ts")) {
  main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
