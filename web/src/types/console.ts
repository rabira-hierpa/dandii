import type { OperatorCode } from "@/lib/operators";

/** Tabs on a selected route in the console. Mirrors the GTFS-X tab set. */
export type RouteEditorTab = "details" | "stops" | "trips" | "service";

/**
 * One direction of a route, as the editor sees it. `headsign` is what riders
 * read on the vehicle, and doubles as the direction's label.
 */
export interface RouteDirection {
  directionId: number;
  headsign: string | null;
  shapeId: string | null;
  shapePoints: number;
  tripCount: number;
  stopCount: number;
}

/** Minimal stop shape for pickers and summaries. */
export interface RouteStop {
  id: string;
  name: string;
}

/** A stop on a route, in trip order, with where it came from. */
export interface RouteStopRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sequence: number;
  /** True when the operator created this stop rather than the feed. */
  operatorCreated: boolean;
  /** Renamed via StopOverride — shown so an operator can tell edits apart. */
  edited: boolean;
  /** How many OTHER routes serve this stop. Drives the delete guard. */
  otherRouteCount: number;
}

/**
 * Editable route fields. Every one is nullable because null means "not edited"
 * and the base feed value stands — the editor shows the base as a placeholder.
 */
export interface EditableRouteFields {
  shortName: string | null;
  longName: string | null;
  desc: string | null;
  url: string | null;
  type: number | null;
  color: string | null;
  textColor: string | null;
  operatorCode: OperatorCode | null;
  continuousPickup: number | null;
  continuousDropOff: number | null;
}

/** Everything the route editor loads for one selected route. */
export interface RouteEditorDetail {
  id: string;
  /** The effective values (base with any override applied). */
  shortName: string;
  longName: string;
  type: number;
  color: string | null;
  textColor: string | null;
  operatorCode: OperatorCode | null;
  agencyId: string;
  operatorCreated: boolean;
  /** Raw override row, so the form can tell "edited to X" from "base is X". */
  override: EditableRouteFields | null;
  directions: RouteDirection[];
  /** Stops keyed by directionId. */
  stopsByDirection: Record<number, RouteStopRow[]>;
}

/**
 * GTFS route_type. The feed uses 0 (tram/LRT) and 3 (bus); the rest are offered
 * because an operator correcting a misclassified route needs the real option.
 */
export const ROUTE_TYPES: { value: number; label: string }[] = [
  { value: 0, label: "Tram / Light rail" },
  { value: 1, label: "Subway / Metro" },
  { value: 2, label: "Rail" },
  { value: 3, label: "Bus" },
  { value: 4, label: "Ferry" },
  { value: 5, label: "Cable tram" },
  { value: 7, label: "Funicular" },
  { value: 11, label: "Trolleybus" },
];

/**
 * GTFS continuous_pickup / continuous_drop_off. Addis minibuses genuinely do
 * board anywhere along the line, so 0 ("continuous") is a real answer here and
 * not the exotic option it is in most feeds.
 */
export const CONTINUOUS_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Not set (fixed stops only)" },
  { value: 0, label: "Continuous — board/alight anywhere" },
  { value: 1, label: "Not continuous" },
  { value: 2, label: "Phone agency to arrange" },
  { value: 3, label: "Coordinate with driver" },
];
