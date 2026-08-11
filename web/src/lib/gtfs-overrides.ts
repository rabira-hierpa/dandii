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
