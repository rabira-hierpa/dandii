/**
 * OTP transfer fallback for the journey planner.
 *
 * The primary path is DB direct-route matching (lib/directions.ts). When no
 * single-seat ride covers the trip, we fall back to OpenTripPlanner for
 * multi-leg journeys. This is only usable because the OTP graph now includes
 * an OSM street layer (see docker-compose.yml): coordinate planning works,
 * walk legs carry real street geometry (no broken lines), and transfers route
 * over the street network.
 *
 * Results are normalized into the same operator-ranked shape the UI uses for
 * direct routes, so minibus-first ordering and the agency filter apply here too.
 */
import { decodePolyline } from "@/components/map/polyline";
import type { JourneyLeg, TransferJourney } from "@/components/map/types";
import type { DirectionsAnchor } from "@/lib/directions";
import { OPERATOR_META, type OperatorCode } from "@/lib/operators";

const OTP_URL = process.env.OTP_URL ?? "http://localhost:8080";

/** Same ranking as direct routes: minibus first, LRT last. */
const OPERATOR_PRIORITY: Record<OperatorCode, number> = {
  MINIBUS: 0,
  SHEGER: 1,
  ANBESSA: 2,
  ALLIANCE: 3,
  LRT: 4,
};

const ALL_CODES: OperatorCode[] = [
  "MINIBUS",
  "SHEGER",
  "ANBESSA",
  "ALLIANCE",
  "LRT",
];

const PLAN_QUERY = `
query Plan($from: InputCoordinates!, $to: InputCoordinates!, $banned: InputBanned) {
  plan(
    from: $from
    to: $to
    transportModes: [{ mode: WALK }, { mode: TRANSIT }]
    numItineraries: 8
    banned: $banned
  ) {
    itineraries {
      duration
      walkDistance
      legs {
        mode
        duration
        distance
        from { name lat lon }
        to { name lat lon }
        route { shortName agency { gtfsId } }
        legGeometry { points }
      }
    }
  }
}`;

export interface OtpPlanLeg {
  mode: string;
  duration: number;
  distance: number;
  from: { name: string | null; lat: number; lon: number };
  to: { name: string | null; lat: number; lon: number };
  route: { shortName: string | null; agency: { gtfsId: string } | null } | null;
  legGeometry: { points: string } | null;
}

export interface OtpPlanItinerary {
  duration: number;
  walkDistance: number;
  legs: OtpPlanLeg[];
}

/** "1:MINIBUS" → MINIBUS; anything else (e.g. "1:AA") → null. */
export function operatorFromAgency(gtfsId: string | null | undefined): OperatorCode | null {
  if (!gtfsId) return null;
  const code = gtfsId.includes(":") ? gtfsId.split(":")[1] : gtfsId;
  return (ALL_CODES as string[]).includes(code) ? (code as OperatorCode) : null;
}

/** Per-leg fare estimate (mirrors the seeded operator fare defaults). */
export function legFareEtb(
  operator: OperatorCode | null,
  mode: string,
  km: number,
): number {
  if (mode === "WALK") return 0;
  if (operator === "LRT" || mode === "TRAM" || mode === "RAIL") {
    return km <= 4 ? 10 : km <= 8 ? 15 : 20;
  }
  if (operator === "MINIBUS") return km <= 3 ? 15 : km <= 7 ? 25 : 35;
  if (operator === "ANBESSA") return 10;
  return 15; // Sheger, Alliance, unknown fixed-route
}

function toLineString(leg: OtpPlanLeg): GeoJSON.LineString {
  const pts = leg.legGeometry?.points;
  const coords = pts ? decodePolyline(pts) : [];
  if (coords.length >= 2) return { type: "LineString", coordinates: coords };
  // Post-OSM walk legs carry geometry; keep a straight-line guard anyway.
  return {
    type: "LineString",
    coordinates: [
      [leg.from.lon, leg.from.lat],
      [leg.to.lon, leg.to.lat],
    ],
  };
}

/**
 * Multi-leg journeys from `origin` to `destination`, operator-ranked. When
 * `operators` is non-empty, OTP is restricted to those operators (the
 * complement is banned), so every returned journey respects the agency filter.
 */
export async function planTransferJourneys(
  origin: DirectionsAnchor,
  destination: DirectionsAnchor,
  operators: OperatorCode[] = [],
): Promise<TransferJourney[]> {
  let banned: { agencies: string } | undefined;
  if (operators.length > 0) {
    const allowed = new Set(operators);
    const bannedCodes = ALL_CODES.filter((c) => !allowed.has(c)).map(
      (c) => `1:${c}`,
    );
    bannedCodes.push("1:AA"); // exclude unassigned routes when filtering
    banned = { agencies: bannedCodes.join(",") };
  }

  let itineraries: OtpPlanItinerary[] = [];
  try {
    const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        query: PLAN_QUERY,
        variables: {
          from: { lat: origin.lat, lon: origin.lon },
          to: { lat: destination.lat, lon: destination.lon },
          banned,
        },
      }),
    });
    const data = await res.json();
    itineraries = (data?.data?.plan?.itineraries ?? []) as OtpPlanItinerary[];
  } catch {
    return [];
  }

  return journeysFromItineraries(itineraries);
}

/**
 * Normalize OTP itineraries into operator-ranked transfer journeys. Pure (no
 * network) so it's unit-testable: drops pure-walk itineraries, dedups OTP's
 * frequency-enumerated near-duplicates by route sequence, tags each journey
 * with its best (highest-priority) operator, and ranks minibus-first.
 */
export function journeysFromItineraries(
  itineraries: OtpPlanItinerary[],
): TransferJourney[] {
  const journeys: TransferJourney[] = [];
  const seen = new Set<string>();
  for (const it of itineraries) {
    const transitLegs = it.legs.filter((l) => l.mode !== "WALK");
    if (transitLegs.length === 0) continue; // pure-walk itineraries aren't useful here

    // Dedup OTP's frequency-enumerated near-duplicates by route sequence.
    const signature = transitLegs
      .map((l) => l.route?.shortName ?? l.mode)
      .join(">");
    if (seen.has(signature)) continue;
    seen.add(signature);

    let fareEtb = 0;
    let bestPriority = 99;
    let primaryOperator: TransferJourney["primaryOperator"] = null;
    const legs: JourneyLeg[] = it.legs.map((l) => {
      const operatorCode = operatorFromAgency(l.route?.agency?.gtfsId);
      const km = l.distance / 1000;
      fareEtb += legFareEtb(operatorCode, l.mode, km);
      if (operatorCode) {
        const p = OPERATOR_PRIORITY[operatorCode];
        if (p < bestPriority) {
          bestPriority = p;
          primaryOperator = {
            code: operatorCode,
            name: OPERATOR_META[operatorCode].name,
            color: OPERATOR_META[operatorCode].color,
          };
        }
      }
      return {
        mode: l.mode,
        operator: operatorCode
          ? {
              code: operatorCode,
              name: OPERATOR_META[operatorCode].name,
              color: OPERATOR_META[operatorCode].color,
            }
          : null,
        routeShortName: l.route?.shortName ?? null,
        fromName: l.from.name ?? "",
        toName: l.to.name ?? "",
        durationSecs: Math.round(l.duration),
        distanceMeters: Math.round(l.distance),
        shape: toLineString(l),
      };
    });

    journeys.push({
      id: signature,
      totalSecs: Math.round(it.duration),
      walkMeters: Math.round(it.walkDistance),
      transfers: Math.max(0, transitLegs.length - 1),
      primaryOperator,
      fareEtb: Math.round(fareEtb),
      legs,
    });
  }

  journeys.sort((a, b) => {
    const pa = a.primaryOperator ? OPERATOR_PRIORITY[a.primaryOperator.code] : 99;
    const pb = b.primaryOperator ? OPERATOR_PRIORITY[b.primaryOperator.code] : 99;
    if (pa !== pb) return pa - pb;
    return a.totalSecs - b.totalSecs;
  });
  return journeys.slice(0, 4);
}
