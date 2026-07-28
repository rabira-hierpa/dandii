import type { OperatorCode } from "@/lib/operators";

export interface RouteSearchResult {
  id: string;
  shortName: string;
  longName: string;
  operatorCode: OperatorCode | null;
}

export interface StopSearchResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Number of feed stops sharing this name, when results are grouped. */
  count?: number;
}

export interface RouteHoverPreview {
  id: string;
  shortName: string;
  longName: string;
  routeType: number;
  geojson: GeoJSON.LineString | null;
  operatorCode: string | null;
  closed: boolean;
  stops: StopSearchResult[];
}

export interface RouteDetail {
  id: string;
  shortName: string;
  longName: string;
  routeType: number;
  lengthMeters: number | null;
  geojson: GeoJSON.LineString | null;
  operator: { code: OperatorCode; name: string } | null;
  fare: {
    kind: "FLAT" | "TIERED";
    flatAmountEtb: number | null;
    summary: string | null;
    tiers: {
      label: string;
      fromKm: number;
      toKm: number | null;
      amountEtb: number;
    }[];
  } | null;
  closure: {
    reason: string;
    note: string | null;
    startsAt: string;
    endsAt: string;
  } | null;
  headsign: string | null;
  frequencies: { startTime: string; endTime: string; headwaySecs: number }[];
  stops: { id: string; name: string; lat: number; lon: number }[];
}

// --- Direct-route journey planner (lib/directions.ts serves these shapes) ---

export interface DirectionsAnchor {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface DirectRouteEndpoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface DirectRoute {
  routeId: string;
  shortName: string;
  longName: string;
  operator: { code: OperatorCode; name: string; color: string } | null;
  headsign: string | null;
  board: DirectRouteEndpoint;
  alight: DirectRouteEndpoint;
  /** Ordered stops served on the ride, board → alight inclusive. */
  stops: DirectRouteEndpoint[];
  walkToBoardMeters: number;
  walkFromAlightMeters: number;
  /** On-board stops between board and alight. */
  numStops: number;
  inVehicleSecs: number;
  waitSecs: number;
  walkSecs: number;
  totalSecs: number;
  rideKm: number;
  fareEtb: number | null;
  /** Route shape sliced to the board→alight segment, for drawing. */
  shape: GeoJSON.LineString;
  closed: boolean;
}

/** One leg of a multi-leg OTP journey (transfer fallback). */
export interface JourneyLeg {
  mode: string; // WALK | BUS | TRAM | RAIL
  operator: { code: OperatorCode; name: string; color: string } | null;
  routeShortName: string | null;
  fromName: string;
  toName: string;
  durationSecs: number;
  distanceMeters: number;
  shape: GeoJSON.LineString;
}

/**
 * A journey that needs one or more transfers, from OTP. Only used when no
 * single-seat DirectRoute covers the trip.
 */
export interface TransferJourney {
  id: string;
  totalSecs: number;
  walkMeters: number;
  transfers: number;
  primaryOperator: { code: OperatorCode; name: string; color: string } | null;
  fareEtb: number | null;
  legs: JourneyLeg[];
}

export interface DirectionsResponse {
  origin: DirectionsAnchor;
  destination: DirectionsAnchor;
  direct: DirectRoute[];
  /** Multi-leg alternatives, present only when `direct` is empty. */
  fallback: TransferJourney[];
}

export interface OtpLeg {
  mode: string;
  duration: number;
  distance: number;
  startTime: number;
  endTime: number;
  from: { name: string };
  to: { name: string };
  route: { shortName: string | null; longName: string | null } | null;
  legGeometry: { points: string } | null;
}

export interface OtpItinerary {
  duration: number;
  walkDistance: number;
  startTime: number;
  endTime: number;
  legs: OtpLeg[];
}
