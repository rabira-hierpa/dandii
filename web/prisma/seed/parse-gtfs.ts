import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

/** Repo-root GTFS directory; override with GTFS_DIR for other layouts. */
export const GTFS_DIR =
  process.env.GTFS_DIR ?? path.resolve(process.cwd(), "../data/gtfs-2026");

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
