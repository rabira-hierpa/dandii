/**
 * GTFS export shapes — the operator edits that get folded into the generated
 * feed. Kept here rather than beside the exporter because both `lib/gtfs-export`
 * and the console actions that write overrides need them.
 */

/** A renamed stop. `name` is the corrected value; null means "not edited". */
export interface StopNameOverride {
  stopId: string;
  name: string;
}

/**
 * Route fields an operator can correct. Null means "not edited" — the base feed
 * value stands. `desc`/`url`/`continuous*` have no column in the DT4A feed, so
 * emitting them requires widening the exported header.
 */
export interface RouteFieldOverride {
  routeId: string;
  shortName: string | null;
  longName: string | null;
  color: string | null;
  textColor: string | null;
  desc: string | null;
  url: string | null;
  type: number | null;
  continuousPickup: number | null;
  continuousDropOff: number | null;
}

/**
 * A stop that exists only because an operator created it — there is no base row
 * to patch, so the exporter appends it.
 */
export interface CreatedStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** A route an operator created. Same append-not-patch rule as [CreatedStop]. */
export interface CreatedRoute {
  id: string;
  shortName: string;
  longName: string;
  type: number;
  agencyId: string;
  color: string | null;
  textColor: string | null;
  desc: string | null;
  url: string | null;
}

/** A per-trip correction bound for trips.txt. */
export interface TripFieldOverride {
  tripId: string;
  blockId: string | null;
  headsign: string | null;
}

/** Everything the exporter needs to turn the base feed into the edited feed. */
export interface FeedOverrides {
  stopNames: StopNameOverride[];
  routeFields: RouteFieldOverride[];
  createdStops: CreatedStop[];
  createdRoutes: CreatedRoute[];
  tripFields: TripFieldOverride[];
  /** Tombstoned ids — omitted from the export entirely. */
  deletedStopIds: string[];
  deletedRouteIds: string[];
}

export const EMPTY_FEED_OVERRIDES: FeedOverrides = {
  stopNames: [],
  routeFields: [],
  createdStops: [],
  createdRoutes: [],
  tripFields: [],
  deletedStopIds: [],
  deletedRouteIds: [],
};

/** True when nothing was edited, so the exporter can stream the feed verbatim. */
export function hasNoOverrides(o: FeedOverrides): boolean {
  return (
    o.stopNames.length === 0 &&
    o.routeFields.length === 0 &&
    o.createdStops.length === 0 &&
    o.createdRoutes.length === 0 &&
    o.tripFields.length === 0 &&
    o.deletedStopIds.length === 0 &&
    o.deletedRouteIds.length === 0
  );
}
