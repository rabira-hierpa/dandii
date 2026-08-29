import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

/**
 * Candidate locations for `data/gtfs-2026` (the directory containing
 * `combined/`). GTFS_DIR always wins when set; otherwise probe both cwd
 * layouts the seed actually runs under, the same way lib/gtfs-export.ts's
 * BASE_DIR_CANDIDATES does — the dev server's cwd is the repo root
 * (`data/gtfs-2026` is a child), but a Docker `exec` into the standalone
 * image has cwd `/app` with the feed bind-mounted at `/app/data` (still a
 * child, not `../data` as web/-relative local runs would resolve). Trying
 * both, in order, means one seed script works in every layout instead of
 * requiring GTFS_DIR to be set by hand for Docker.
 */
function resolveGtfsDir(): string {
  const candidates = [
    process.env.GTFS_DIR,
    path.resolve(process.cwd(), "data", "gtfs-2026"),
    path.resolve(process.cwd(), "..", "data", "gtfs-2026"),
  ].filter((p): p is string => Boolean(p));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "combined", "stops.txt"))) return dir;
  }
  // Fall back to the first candidate (old default behaviour) so the error
  // message below — not a silent path a caller has to trace back — is what
  // readGtfsFile's ENOENT actually points at.
  return candidates[0] ?? path.resolve(process.cwd(), "../data/gtfs-2026");
}

/** Directory containing `combined/`; override with GTFS_DIR for other layouts. */
export const GTFS_DIR = resolveGtfsDir();

/**
 * Header-based CSV parse — column order differs between the combined feed
 * and the bus/minibus sub-feeds, so positional parsing would silently break.
 */
export function readGtfsFile<T extends Record<string, string>>(
  relativePath: string,
): T[] {
  const file = path.join(GTFS_DIR, relativePath);
  const content = fs.readFileSync(file, "utf8");
  const { data, errors } = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (errors.length > 0) {
    throw new Error(
      `Failed to parse ${relativePath}: ${errors[0].message} (row ${errors[0].row})`,
    );
  }
  return data;
}

export interface GtfsRoute extends Record<string, string> {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
  route_color: string;
  route_text_color: string;
  agency_id: string;
}

export interface GtfsStop extends Record<string, string> {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
}

export interface GtfsTrip extends Record<string, string> {
  trip_id: string;
  route_id: string;
  service_id: string;
  shape_id: string;
  /** GTFS direction_id, "0" | "1". Populated throughout the DT4A feed. */
  direction_id: string;
  trip_headsign: string;
}

export interface GtfsStopTime extends Record<string, string> {
  trip_id: string;
  stop_id: string;
  stop_sequence: string;
  arrival_time: string;
  departure_time: string;
}

export interface GtfsFrequency extends Record<string, string> {
  trip_id: string;
  start_time: string;
  end_time: string;
  headway_secs: string;
}

export interface GtfsCalendar extends Record<string, string> {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

export interface GtfsShapePoint extends Record<string, string> {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
}

export interface GtfsAgency extends Record<string, string> {
  agency_id: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
}

/**
 * GTFS `translations.txt`. The spec allows referencing the row to translate
 * either by `record_id` (the entity's own id) or by `field_value` (the exact
 * original string) — a feed may use either, so `loadStopNameTranslations`
 * below checks both.
 */
export interface GtfsTranslation extends Record<string, string> {
  table_name: string;
  field_name: string;
  language: string;
  translation: string;
  // Optional per the GTFS spec, but papaparse fills an absent column with ""
  // for every row rather than omitting the key — kept required to match the
  // Record<string, string> index signature the other Gtfs* types also use.
  record_id: string;
  record_sub_id: string;
  field_value: string;
}

/** Same as `readGtfsFile`, but returns `[]` for a file the feed doesn't ship
 * instead of throwing — `translations.txt` is optional GTFS, not every feed
 * (including ours, today) includes one. */
export function readGtfsFileOptional<T extends Record<string, string>>(
  relativePath: string,
): T[] {
  if (!fs.existsSync(path.join(GTFS_DIR, relativePath))) return [];
  return readGtfsFile<T>(relativePath);
}

/**
 * Amharic stop names from the feed's own `translations.txt`, keyed both by
 * `stop_id` and by the original `stop_name` so a lookup can try either. Empty
 * when the feed has no translations file — the console/seed fallback (an
 * operator's edit, or the curated hub-name seed) is what fills the gap then.
 */
export function loadStopNameTranslations(language: string): Map<string, string> {
  const rows = readGtfsFileOptional<GtfsTranslation>("combined/translations.txt");
  const byKey = new Map<string, string>();
  for (const row of rows) {
    if (row.table_name !== "stops" || row.field_name !== "stop_name") continue;
    if (row.language !== language) continue;
    if (row.record_id) byKey.set(row.record_id, row.translation);
    if (row.field_value) byKey.set(row.field_value, row.translation);
  }
  return byKey;
}
