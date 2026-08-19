/**
 * Rewrite base-feed CSV tables with operator corrections.
 *
 * The GTFS export copies the vendored feed verbatim except for the tables it
 * regenerates. Once an operator edits a stop name or a route's metadata, the
 * exported zip has to carry the edit — otherwise the correction shows on our
 * map but not in the feed OTP builds its graph from, and the two disagree.
 *
 * Three things happen per table:
 *
 *  - **patch** cells on rows that exist in the base feed;
 *  - **append** rows for entities an operator created, which have no base row;
 *  - **omit** rows the operator tombstoned.
 *
 * Plus one subtlety that is easy to miss: an operator can fill in a field the
 * DT4A feed has no column for (`route_url`, `continuous_pickup`,
 * `continuous_drop_off`). Pinning the output header to the base header — which
 * is what a naive `Papa.unparse` does — silently swallows those values. The
 * header is widened instead.
 */
import Papa from "papaparse";
import type {
  CreatedRoute,
  CreatedStop,
  RouteFieldOverride,
  StopNameOverride,
  TripFieldOverride,
} from "@/types/gtfs";

type Row = Record<string, string>;

interface RewriteOptions {
  /** Mutates a base row in place. */
  patch?: (row: Row) => void;
  /** Rows to append after the base rows (operator-created entities). */
  append?: Row[];
  /** Base rows whose id is in this set are dropped. */
  omit?: Set<string>;
  /** Columns to add to the header when the base feed lacks them. */
  extraColumns?: string[];
}

/**
 * Parse, patch, re-serialize. Papa handles the quoting rules on both ends,
 * which matters because `route_long_name` routinely contains commas ("Ayat
 * Chefe Condominium ↔ 6 Kilo") and hand-rolled splitting corrupts them.
 */
function rewriteCsv(
  content: string,
  idColumn: string,
  options: RewriteOptions,
): string {
  const parsed = Papa.parse<Row>(content.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  let rows = parsed.data;
  if (rows.length === 0) return content;
  if (!Object.hasOwn(rows[0], idColumn)) {
    // Not the table we expected — return untouched rather than emit a feed
    // whose columns we just silently dropped.
    return content;
  }

  if (options.omit && options.omit.size > 0) {
    rows = rows.filter((row) => !options.omit!.has(row[idColumn]));
  }
  if (options.patch) {
    for (const row of rows) options.patch(row);
  }

  // Base header order is preserved; genuinely new columns are appended so a
  // consumer diffing against the vendored feed sees additions, not a reshuffle.
  const baseColumns = parsed.meta.fields ?? Object.keys(rows[0] ?? {});
  const columns = [...baseColumns];
  for (const extra of options.extraColumns ?? []) {
    if (!columns.includes(extra)) columns.push(extra);
  }

  if (options.append && options.append.length > 0) {
    // Created rows must carry every column, or Papa emits ragged lines.
    const blank: Row = Object.fromEntries(columns.map((c) => [c, ""]));
    rows = [...rows, ...options.append.map((r) => ({ ...blank, ...r }))];
  }

  return Papa.unparse(rows, { columns, newline: "\n" }) + "\n";
}

/** `stops.txt` with renames patched, created stops appended, deleted omitted. */
export function applyStopOverridesToCsv(
  content: string,
  overrides: StopNameOverride[],
  created: CreatedStop[] = [],
  deletedIds: string[] = [],
): string {
  if (
    overrides.length === 0 &&
    created.length === 0 &&
    deletedIds.length === 0
  ) {
    return content;
  }
  const byId = new Map(overrides.map((o) => [o.stopId, o.name]));

  return rewriteCsv(content, "stop_id", {
    omit: new Set(deletedIds),
    patch: (row) => {
      const name = byId.get(row.stop_id);
      if (name !== undefined) row.stop_name = name;
    },
    append: created.map((s) => ({
      stop_id: s.id,
      stop_name: s.name,
      stop_lat: String(s.lat),
      stop_lon: String(s.lon),
    })),
  });
}

/**
 * `routes.txt` with edits patched, created routes appended, deleted omitted.
 *
 * `agency_id` is deliberately NOT handled here: it is rewritten per operator by
 * `scripts/otp-feed-agencies.ts`, which runs over the produced feed and already
 * reads the current RouteAssignment — and an operator reassignment updates that
 * assignment, so the agency follows without a second writer for the column.
 */
export function applyRouteOverridesToCsv(
  content: string,
  overrides: RouteFieldOverride[],
  created: CreatedRoute[] = [],
  deletedIds: string[] = [],
): string {
  if (
    overrides.length === 0 &&
    created.length === 0 &&
    deletedIds.length === 0
  ) {
    return content;
  }
  const byId = new Map(overrides.map((o) => [o.routeId, o]));

  // Only widen for fields an operator actually filled in — an untouched feed
  // should not sprout empty columns just because the editor supports them.
  const extraColumns: string[] = [];
  const needs = (pick: (o: RouteFieldOverride) => unknown) =>
    overrides.some((o) => pick(o) !== null);
  // route_desc happens to exist in the DT4A feed, but widening for it too means
  // this does not quietly lose data on a feed that omits the column.
  if (needs((o) => o.desc) || created.some((r) => r.desc !== null)) {
    extraColumns.push("route_desc");
  }
  if (needs((o) => o.url) || created.some((r) => r.url !== null)) {
    extraColumns.push("route_url");
  }
  if (needs((o) => o.continuousPickup)) extraColumns.push("continuous_pickup");
  if (needs((o) => o.continuousDropOff)) {
    extraColumns.push("continuous_drop_off");
  }

  return rewriteCsv(content, "route_id", {
    omit: new Set(deletedIds),
    extraColumns,
    patch: (row) => {
      const o = byId.get(row.route_id);
      if (!o) return;
      // Null = unedited, so the base value stands.
      if (o.shortName !== null) row.route_short_name = o.shortName;
      if (o.longName !== null) row.route_long_name = o.longName;
      if (o.color !== null) row.route_color = o.color;
      if (o.textColor !== null) row.route_text_color = o.textColor;
      if (o.desc !== null) row.route_desc = o.desc;
      if (o.url !== null) row.route_url = o.url;
      if (o.type !== null) row.route_type = String(o.type);
      if (o.continuousPickup !== null) {
        row.continuous_pickup = String(o.continuousPickup);
      }
      if (o.continuousDropOff !== null) {
        row.continuous_drop_off = String(o.continuousDropOff);
      }
    },
    append: created.map((r) => ({
      route_id: r.id,
      agency_id: r.agencyId,
      route_short_name: r.shortName,
      route_long_name: r.longName,
      route_type: String(r.type),
      route_color: r.color ?? "",
      route_text_color: r.textColor ?? "",
      route_desc: r.desc ?? "",
      ...(r.url !== null ? { route_url: r.url } : {}),
    })),
  });
}

/**
 * `stop_times.txt` with operator-reordered calls rewritten.
 *
 * Unlike the other tables this is not a patch-by-id: nothing about an individual
 * row changes, the rows change *places*. Each affected trip's block is re-emitted
 * in the operator's order and renumbered 1..n.
 *
 * **Times stay with the position, not the stop** — the same contract
 * `reorderRouteStops` applies in the database. A run reaches its fifth call at
 * 06:20 whichever stop that is; carrying each stop's old time along with it
 * would emit a timetable that goes backwards in the middle, which is invalid
 * GTFS and breaks every arrival estimate downstream.
 *
 * A trip whose rows don't match the ordered set is left exactly as it was. The
 * override could be stale against a re-vendored feed, and shipping a feed with
 * dropped or invented calls is far worse than shipping the original order.
 */
export function applyStopTimeOrderToCsv(
  content: string,
  ordersByTrip: Map<string, string[]>,
): string {
  if (ordersByTrip.size === 0) return content;

  const parsed = Papa.parse<Row>(content.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  if (rows.length === 0) return content;
  if (!Object.hasOwn(rows[0], "trip_id") || !Object.hasOwn(rows[0], "stop_id")) {
    return content;
  }

  // Group by trip while preserving first-appearance order, so untouched trips
  // come back out exactly where they went in.
  const blocks = new Map<string, Row[]>();
  for (const row of rows) {
    const block = blocks.get(row.trip_id);
    if (block) block.push(row);
    else blocks.set(row.trip_id, [row]);
  }

  for (const [tripId, block] of blocks) {
    const order = ordersByTrip.get(tripId);
    if (!order) continue;

    const byStop = new Map(block.map((r) => [r.stop_id, r]));
    const samePattern =
      byStop.size === block.length &&
      order.length === block.length &&
      order.every((id) => byStop.has(id));
    if (!samePattern) continue;

    const inSequence = [...block].sort(
      (a, b) => Number(a.stop_sequence) - Number(b.stop_sequence),
    );
    blocks.set(
      tripId,
      order.map((stopId, i) => ({
        ...(byStop.get(stopId) as Row),
        arrival_time: inSequence[i].arrival_time,
        departure_time: inSequence[i].departure_time,
        stop_sequence: String(i + 1),
      })),
    );
  }

  const columns = parsed.meta.fields ?? Object.keys(rows[0]);
  return (
    Papa.unparse([...blocks.values()].flat(), { columns, newline: "\n" }) + "\n"
  );
}

/**
 * `trips.txt` with per-trip corrections patched in.
 *
 * The DT4A feed has no `block_id` column, so emitting one always widens the
 * header — without that an operator's block grouping would vanish silently on
 * publish, and blocks exist precisely to stop riders being told to change
 * vehicles when they don't have to.
 */
export function applyTripOverridesToCsv(
  content: string,
  overrides: TripFieldOverride[],
): string {
  if (overrides.length === 0) return content;
  const byId = new Map(overrides.map((o) => [o.tripId, o]));

  const extraColumns: string[] = [];
  if (overrides.some((o) => o.blockId !== null)) extraColumns.push("block_id");

  return rewriteCsv(content, "trip_id", {
    extraColumns,
    patch: (row) => {
      const o = byId.get(row.trip_id);
      if (!o) return;
      if (o.blockId !== null) row.block_id = o.blockId;
      if (o.headsign !== null) row.trip_headsign = o.headsign;
    },
  });
}
