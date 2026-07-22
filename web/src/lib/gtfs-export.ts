import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
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
]);

interface FlatFare {
  routeId: string;
  price: number;
}

function fareAttributesCsv(fares: FlatFare[]): string {
  const lines = ["fare_id,price,currency_type,payment_method,transfers"];
  for (const f of fares) {
    // payment_method=0 (paid on board); transfers empty = unlimited.
    lines.push(`f_${f.routeId},${f.price.toFixed(2)},ETB,0,`);
  }
  return lines.join("\n") + "\n";
}

function fareRulesCsv(fares: FlatFare[]): string {
  const lines = ["fare_id,route_id"];
  for (const f of fares) lines.push(`f_${f.routeId},${f.routeId}`);
  return lines.join("\n") + "\n";
}

function feedInfoCsv(version: number): string {
  return (
    [
      "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version,feed_contact_email,feed_contact_url",
      `Dandii (Addis Ababa Transit),https://digitaltransport4africa.org/,en,20191201,20991231,dandii-v${version},info@addismap.com,https://addismaptransit.com/support/`,
    ].join("\n") + "\n"
  );
}

/** Copy the base feed + overlay the three generated files into `filePath`. */
async function buildZip(
  filePath: string,
  baseDir: string,
  version: number,
  fares: FlatFare[],
): Promise<void> {
  const output = createWriteStream(filePath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  const entries = await readdir(baseDir);
  for (const name of entries) {
    if (!name.endsWith(".txt") || REPLACED.has(name)) continue;
    archive.file(path.join(baseDir, name), { name });
  }

  archive.append(feedInfoCsv(version), { name: "feed_info.txt" });
  archive.append(fareAttributesCsv(fares), { name: "fare_attributes.txt" });
  archive.append(fareRulesCsv(fares), { name: "fare_rules.txt" });

  await archive.finalize();
  await done;
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
 */
export async function generateFeedVersion(
  generatedById: string,
): Promise<GeneratedVersion> {
  // Fail loudly if the base feed isn't reachable rather than shipping an
  // empty/partial zip.
  const baseDir = await resolveBaseDir();

  const last = await prisma.feedVersion.findFirst({
    orderBy: { version: "desc" },
    select: { version: true, lastChangeLogId: true },
  });
  const version = (last?.version ?? 0) + 1;
  const label = `v${version}`;

  // Only FLAT fares reach the V1 export (tiered omitted, 4A).
  const fareRows = await prisma.fare.findMany({
    where: { kind: "FLAT", flatAmountEtb: { not: null } },
    select: { routeId: true, flatAmountEtb: true },
    orderBy: { routeId: "asc" },
  });
  const fares: FlatFare[] = fareRows.map((f) => ({
    routeId: f.routeId,
    price: f.flatAmountEtb!.toNumber(),
  }));

  await mkdir(EXPORT_DIR, { recursive: true });
  const filePath = path.join(EXPORT_DIR, `dandii-gtfs-${label}.zip`);
  await buildZip(filePath, baseDir, version, fares);
  const { size } = await stat(filePath);

  // Change report cursor: count FareChangeLog rows since the previous version's
  // anchor, and record the newest row's id as this version's anchor.
  const newestLog = await prisma.fareChangeLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
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

  await pruneOldZips();

  return {
    version,
    label,
    sizeBytes: size,
    fareChangeCount,
    routeCount: fares.length,
  };
}
