import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@/generated/prisma/client";
import {
  fareAttributesCsv,
  fareRulesCsv,
  feedInfoCsv,
  selectFlatFares,
  type FlatFare,
} from "@/lib/gtfs-fares-format";
import {
  applyRouteOverridesToCsv,
  applyStopOverridesToCsv,
  applyShapeOverridesToCsv,
  applyStopTimeOrderToCsv,
  translationsCsv,
  type StopTranslation,
  applyTripOverridesToCsv,
} from "@/lib/gtfs-overrides";
import { hasNoOverrides, type FeedOverrides } from "@/types/gtfs";
import { prisma } from "@/lib/prisma";

/**
 * GTFS "fares overlay" exporter (design §GTFS Export). The generated zip copies
 * the vendored base feed byte-for-byte and adds/replaces exactly three files:
 * fare_attributes.txt, fare_rules.txt (regenerated from the Fare table) and
 * feed_info.txt (feed_version bumped). TIERED fares are OMITTED (decision 4A):
 * Fares V1 without stop zones can carry only one price per route, and shipping
 * the ceiling would overstate short trips — dishonest for an accuracy product.
 */

/**
 * Candidate locations for the vendored combined feed. The dev server's cwd is
 * the repo root, standalone prod runs from web/, and GTFS_BASE_DIR overrides
 * both — so probe all three and use the first that actually holds a feed.
 */
const BASE_DIR_CANDIDATES = [
  process.env.GTFS_BASE_DIR,
  path.resolve(process.cwd(), "data", "gtfs-2026", "combined"),
  path.resolve(process.cwd(), "..", "data", "gtfs-2026", "combined"),
].filter((p): p is string => Boolean(p));

async function resolveBaseDir(): Promise<string> {
  for (const dir of BASE_DIR_CANDIDATES) {
    try {
      await stat(path.join(dir, "routes.txt"));
      return dir;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `Base GTFS feed not found. Looked in: ${BASE_DIR_CANDIDATES.join(", ")}. Set GTFS_BASE_DIR to the combined feed directory.`,
  );
}

/** Where generated zips are written (a Docker volume in production). */
const EXPORT_DIR =
  process.env.GTFS_EXPORT_DIR ??
  path.resolve(process.cwd(), "..", ".gtfs-exports");

/** Keep the newest N zips on the volume; older zip FILES are pruned (rows stay). */
const KEEP_ZIPS = 10;

/** Files we regenerate — skipped when copying the base feed. */
const REPLACED = new Set([
  "feed_info.txt",
  "fare_attributes.txt",
  "fare_rules.txt",
  // Regenerated from the console's Amharic names rather than copied: the
  // vendored DT4A feed ships no translations at all.
  "translations.txt",
]);

/**
 * Operator corrections to fold into the exported feed: field patches, entities
 * created in the console (which have no base-feed row to patch), and tombstoned
 * ids. All empty in the common case, and then the tables copy verbatim.
 */
async function loadFeedOverrides(): Promise<FeedOverrides> {
  const [
    stopRows,
    routeRows,
    createdStops,
    createdRoutes,
    tripRows,
    orderRows,
    shapeRows,
  ] = await Promise.all([
    prisma.stopOverride.findMany({
      select: { stopId: true, name: true, deletedAt: true },
    }),
    prisma.routeOverride.findMany({
      select: {
        routeId: true,
        shortName: true,
        longName: true,
        color: true,
        textColor: true,
        desc: true,
        url: true,
        type: true,
        continuousPickup: true,
        continuousDropOff: true,
        deletedAt: true,
      },
    }),
    prisma.stop.findMany({
      where: { origin: "OPERATOR" },
      select: { id: true, name: true, lat: true, lon: true },
    }),
    prisma.route.findMany({
      where: { origin: "OPERATOR" },
      select: {
        id: true,
        shortName: true,
        longName: true,
        type: true,
        agencyId: true,
        color: true,
        textColor: true,
      },
    }),
    prisma.tripOverride.findMany({
      select: { tripId: true, blockId: true, headsign: true },
    }),
    prisma.routeStopOrderOverride.findMany({
      select: { routeId: true, directionId: true, stopIds: true },
    }),
    prisma.shapeOverride.findMany({
      select: { routeId: true, directionId: true, geojson: true },
    }),
  ]);

  // Drawn geometry is keyed by (route, direction) but shapes.txt is keyed by
  // shape_id, so fan it out across the shapes those trips point at.
  const drawnShapes = new Map<string, [number, number][]>();
  if (shapeRows.length > 0) {
    const drawnTrips = await prisma.trip.findMany({
      where: {
        OR: shapeRows.map((s) => ({
          routeId: s.routeId,
          directionId: s.directionId,
        })),
        shapeId: { not: null },
      },
      select: { shapeId: true, routeId: true, directionId: true },
    });
    const byKey = new Map(
      shapeRows.map((s) => [
        `${s.routeId}:${s.directionId}`,
        ((s.geojson as { coordinates?: number[][] } | null)?.coordinates ??
          []) as [number, number][],
      ]),
    );
    for (const trip of drawnTrips) {
      const coords = byKey.get(`${trip.routeId}:${trip.directionId}`);
      if (coords && coords.length >= 2) {
        drawnShapes.set(trip.shapeId as string, coords);
      }
    }
  }

  // The override is keyed by (route, direction) but stop_times.txt is keyed by
  // trip, so fan it out across the trips that direction actually runs.
  const stopTimeOrders = new Map<string, string[]>();
  if (orderRows.length > 0) {
    const trips = await prisma.trip.findMany({
      where: { OR: orderRows.map((o) => ({ routeId: o.routeId, directionId: o.directionId })) },
      select: { id: true, routeId: true, directionId: true },
    });
    const orderByKey = new Map(
      orderRows.map((o) => [`${o.routeId}:${o.directionId}`, o.stopIds as string[]]),
    );
    for (const trip of trips) {
      const order = orderByKey.get(`${trip.routeId}:${trip.directionId}`);
      if (order) stopTimeOrders.set(trip.id, order);
    }
  }

  const routeOverrideById = new Map(routeRows.map((r) => [r.routeId, r]));
  return {
    stopNames: stopRows
      .filter((s) => s.name !== null && s.deletedAt === null)
      .map((s) => ({ stopId: s.stopId, name: s.name as string })),
    routeFields: routeRows.filter((r) => r.deletedAt === null),
    createdStops,
    tripFields: tripRows,
    stopTimeOrders,
    drawnShapes,
    // A created route can also carry an override row (renamed after creation),
    // so desc/url come from there when present.
    createdRoutes: createdRoutes.map((r) => ({
      ...r,
      desc: routeOverrideById.get(r.id)?.desc ?? null,
      url: routeOverrideById.get(r.id)?.url ?? null,
    })),
    deletedStopIds: stopRows
      .filter((s) => s.deletedAt !== null)
      .map((s) => s.stopId),
    deletedRouteIds: routeRows
      .filter((r) => r.deletedAt !== null)
      .map((r) => r.routeId),
  };
}

/** Copy the base feed + overlay the three generated files into `filePath`. */
/**
 * Effective Amharic names: the console's correction where one exists,
 * otherwise whatever the seed loaded. Tombstoned stops are left out — they
 * are not in the exported `stops.txt`, and a translation naming a stop the
 * feed lacks is a foreign-key violation.
 */
async function loadStopTranslations(): Promise<StopTranslation[]> {
  const [stops, overrides] = await Promise.all([
    prisma.stop.findMany({
      where: { nameAm: { not: null } },
      select: { id: true, nameAm: true },
    }),
    prisma.stopOverride.findMany({
      where: { nameAm: { not: null } },
      select: { stopId: true, nameAm: true, deletedAt: true },
    }),
  ]);

  const byStop = new Map<string, string>();
  for (const stop of stops) byStop.set(stop.id, stop.nameAm!);
  for (const override of overrides) {
    if (override.deletedAt) byStop.delete(override.stopId);
    else byStop.set(override.stopId, override.nameAm!);
  }

  const tombstoned = new Set(
    overrides.filter((o) => o.deletedAt).map((o) => o.stopId),
  );
  return [...byStop]
    .filter(([stopId]) => !tombstoned.has(stopId))
    .map(([stopId, nameAm]) => ({ stopId, nameAm }))
    .sort((a, b) => a.stopId.localeCompare(b.stopId));
}

async function buildZip(
  filePath: string,
  baseDir: string,
  version: number,
  fares: FlatFare[],
  overrides: FeedOverrides,
): Promise<void> {
  const output = createWriteStream(filePath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  // Tables with operator edits are rewritten from base + overrides; everything
  // else is streamed straight from disk, so an unedited feed costs nothing.
  const edited = new Map<string, (base: string) => string>();
  if (!hasNoOverrides(overrides)) {
    edited.set("stops.txt", (base) =>
      applyStopOverridesToCsv(
        base,
        overrides.stopNames,
        overrides.createdStops,
        overrides.deletedStopIds,
      ),
    );
    edited.set("routes.txt", (base) =>
      applyRouteOverridesToCsv(
        base,
        overrides.routeFields,
        overrides.createdRoutes,
        overrides.deletedRouteIds,
      ),
    );
    edited.set("trips.txt", (base) =>
      applyTripOverridesToCsv(base, overrides.tripFields),
    );
    edited.set("stop_times.txt", (base) =>
      applyStopTimeOrderToCsv(base, overrides.stopTimeOrders),
    );
    edited.set("shapes.txt", (base) =>
      applyShapeOverridesToCsv(base, overrides.drawnShapes),
    );
  }

  const entries = await readdir(baseDir);
  for (const name of entries) {
    if (!name.endsWith(".txt") || REPLACED.has(name)) continue;
    const rewrite = edited.get(name);
    if (rewrite) {
      const base = await readFile(path.join(baseDir, name), "utf8");
      archive.append(rewrite(base), { name });
      continue;
    }
    archive.file(path.join(baseDir, name), { name });
  }

  // Amharic names reach riders only through this file — a name typed in the
  // console and left out of the export would show on our map and nowhere
  // else, which is the same trap console-created routes fell into.
  const translations = translationsCsv(await loadStopTranslations());
  if (translations !== "") {
    archive.append(translations, { name: "translations.txt" });
  }

  archive.append(feedInfoCsv(version), { name: "feed_info.txt" });
  archive.append(fareAttributesCsv(fares), { name: "fare_attributes.txt" });
  archive.append(fareRulesCsv(fares), { name: "fare_rules.txt" });

  await archive.finalize();
  await done;
}

/**
 * route_ids present in the base feed's routes.txt. A fare_rules row for a
 * route not in routes.txt is a GTFS foreign_key_violation, so console-created
 * routes (id `manual-…`) that never made it into the vendored feed must be
 * excluded from the overlay. route_id is the first column and its values carry
 * no commas, so splitting on "," is safe even for quoted long-name fields.
 */
async function readBaseRouteIds(baseDir: string): Promise<Set<string>> {
  const content = await readFile(path.join(baseDir, "routes.txt"), "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const idx = lines[0].split(",").indexOf("route_id");
  if (idx === -1) throw new Error("base routes.txt has no route_id column");
  const ids = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const id = lines[i].split(",")[idx];
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * route_ids the exported routes.txt will actually contain.
 *
 * A fare_rules row naming a route that routes.txt lacks is a GTFS
 * foreign_key_violation, and the exported file is no longer just the base feed:
 * operator-created routes are appended to it and tombstoned ones are dropped.
 */
async function readExportedRouteIds(
  baseDir: string,
  overrides: FeedOverrides,
): Promise<Set<string>> {
  const ids = await readBaseRouteIds(baseDir);
  for (const r of overrides.createdRoutes) ids.add(r.id);
  for (const id of overrides.deletedRouteIds) ids.delete(id);
  return ids;
}

/** Prune zip FILES beyond the newest KEEP_ZIPS (DB rows are kept for audit). */
async function pruneOldZips(): Promise<void> {
  const stale = await prisma.feedVersion.findMany({
    orderBy: { version: "desc" },
    skip: KEEP_ZIPS,
    select: { filePath: true },
  });
  await Promise.all(stale.map((v) => unlink(v.filePath).catch(() => {})));
}

export interface GeneratedVersion {
  version: number;
  label: string;
  sizeBytes: number;
  fareChangeCount: number;
  routeCount: number;
}

/**
 * Generate the next feed version: build the zip, write a FeedVersion row
 * (validatorStatus PENDING — the validator gate runs in CI only), and prune
 * old zip files. Synchronous end to end (file copies + two small files).
 *
 * Version allocation retries on P2002 so concurrent generate calls cannot
 * collide on FeedVersion.version @unique.
 */
export async function generateFeedVersion(
  generatedById: string,
): Promise<GeneratedVersion> {
  const baseDir = await resolveBaseDir();

  const fareRows = await prisma.fare.findMany({
    select: { routeId: true, kind: true, flatAmountEtb: true },
  });
  const allFlat = selectFlatFares(
    fareRows.map((f) => ({
      routeId: f.routeId,
      kind: f.kind,
      flatAmountEtb: f.flatAmountEtb?.toNumber() ?? null,
    })),
  );
  const overrides = await loadFeedOverrides();
  const exportedRouteIds = await readExportedRouteIds(baseDir, overrides);
  const fares: FlatFare[] = allFlat.filter((f) =>
    exportedRouteIds.has(f.routeId),
  );

  await mkdir(EXPORT_DIR, { recursive: true });

  const newestLog = await prisma.fareChangeLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  let lastAttemptError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await prisma.feedVersion.findFirst({
      orderBy: { version: "desc" },
      select: { version: true, lastChangeLogId: true },
    });
    const version = (last?.version ?? 0) + 1;
    const label = `v${version}`;
    const filePath = path.join(EXPORT_DIR, `dandii-gtfs-${label}.zip`);

    let fareChangeCount: number;
    if (last?.lastChangeLogId) {
      const cursor = await prisma.fareChangeLog.findUnique({
        where: { id: last.lastChangeLogId },
        select: { createdAt: true },
      });
      fareChangeCount = cursor
        ? await prisma.fareChangeLog.count({
            where: { createdAt: { gt: cursor.createdAt } },
          })
        : await prisma.fareChangeLog.count();
    } else {
      fareChangeCount = await prisma.fareChangeLog.count();
    }

    await buildZip(filePath, baseDir, version, fares, overrides);
    const { size } = await stat(filePath);

    try {
      await prisma.feedVersion.create({
        data: {
          version,
          label,
          filePath,
          sizeBytes: size,
          fareChangeCount,
          generatedById,
          lastChangeLogId: newestLog?.id ?? last?.lastChangeLogId ?? null,
        },
      });
    } catch (e) {
      lastAttemptError = e;
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // Another generate won the version slot — retry with a fresh max.
        try {
          await unlink(filePath);
        } catch {
          // zip may already be gone
        }
        continue;
      }
      throw e;
    }

    await pruneOldZips();

    return {
      version,
      label,
      sizeBytes: size,
      fareChangeCount,
      routeCount: fares.length,
    };
  }

  throw lastAttemptError instanceof Error
    ? lastAttemptError
    : new Error("Could not allocate a unique feed version after retries");
}
