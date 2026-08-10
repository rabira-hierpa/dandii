/**
 * Rewrite base-feed CSV tables with operator corrections.
 *
 * The GTFS export copies the vendored feed verbatim except for the tables it
 * regenerates. Once an operator edits a stop name or a route's metadata, the
 * exported zip has to carry the edit — otherwise the correction shows on our
 * map but not in the feed OTP builds its graph from, and the two disagree.
 *
 * These helpers rewrite only the cells that were actually edited: every other
 * column, the column order, and the header are preserved exactly as the base
 * feed had them, so a feed with no overrides round-trips unchanged (and the
 * caller skips the rewrite entirely in that case — see `gtfs-export.ts`).
 */
import Papa from "papaparse";

export interface StopNameOverride {
  stopId: string;
  name: string;
}

export interface RouteFieldOverride {
  routeId: string;
  shortName: string | null;
  longName: string | null;
  color: string | null;
  textColor: string | null;
}

type Row = Record<string, string>;

/**
 * Parse, patch, re-serialize. Papa handles the quoting rules on both ends,
 * which matters because `route_long_name` routinely contains commas ("Ayat
 * Chefe Condominium ↔ 6 Kilo") and hand-rolled splitting corrupts them.
 */
function rewriteCsv(
  content: string,
  idColumn: string,
  patch: (row: Row) => void,
): string {
  const parsed = Papa.parse<Row>(content.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  if (rows.length === 0) return content;
  if (!Object.hasOwn(rows[0], idColumn)) {
    // Not the table we expected — return untouched rather than emit a feed
    // whose columns we just silently dropped.
    return content;
  }

  for (const row of rows) patch(row);

  // `columns` pins the original header order; Papa would otherwise infer it
  // from the first row's key order and can drop columns absent there.
  return (
    Papa.unparse(rows, {
      columns: parsed.meta.fields ?? Object.keys(rows[0]),
      newline: "\n",
    }) + "\n"
  );
}

/** `stops.txt` with `stop_name` replaced for every overridden stop. */
export function applyStopOverridesToCsv(
  content: string,
  overrides: StopNameOverride[],
): string {
  const byId = new Map(overrides.map((o) => [o.stopId, o.name]));
  if (byId.size === 0) return content;

  return rewriteCsv(content, "stop_id", (row) => {
    const name = byId.get(row.stop_id);
    if (name !== undefined) row.stop_name = name;
  });
}

/**
 * `routes.txt` with names and colors replaced for every overridden route.
 *
 * `agency_id` is deliberately NOT handled here: it is rewritten per operator by
 * `scripts/otp-feed-agencies.ts`, which runs over the produced feed and already
 * reads the current RouteAssignment — and an operator reassignment updates that
 * assignment, so the agency follows without a second writer for the column.
 */
export function applyRouteOverridesToCsv(
  content: string,
  overrides: RouteFieldOverride[],
): string {
  const byId = new Map(overrides.map((o) => [o.routeId, o]));
  if (byId.size === 0) return content;

  return rewriteCsv(content, "route_id", (row) => {
    const o = byId.get(row.route_id);
    if (!o) return;
    // Null = unedited, so the base value stands.
    if (o.shortName !== null) row.route_short_name = o.shortName;
    if (o.longName !== null) row.route_long_name = o.longName;
    if (o.color !== null) row.route_color = o.color;
    if (o.textColor !== null) row.route_text_color = o.textColor;
  });
}
