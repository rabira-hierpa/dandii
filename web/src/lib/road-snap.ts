/**
 * Snap operator-drawn waypoints to the OSM road network.
 *
 * OTP's graph carries an OSM street layer (added so walk legs stopped rendering
 * as straight lines through buildings), which means it can already answer "what
 * is the drivable path between these two points". That is exactly what drawing
 * a route needs, so this reuses the graph rather than adding a second router.
 *
 * **CAR, not WALK.** `lib/directions.ts` snaps with WALK because it is tracing a
 * rider's walk to a stop, and footbridges and alleys are fair game there. A
 * minibus cannot use them. Measured on the live graph, Meskel Square to Yeka
 * Michael: WALK 5,488m over pedestrian ways, CAR 4,758m on real roads. Drawing a
 * bus route with the walk profile would send it through pedestrian squares.
 */
import { decodePolyline } from "@/components/map/polyline";

const OTP_URL = process.env.OTP_URL ?? "http://localhost:8080";

export interface Waypoint {
  lat: number;
  lon: number;
}

/** One drawn segment between two consecutive waypoints. */
export interface SnappedSegment {
  coordinates: [number, number][];
  /**
   * True when OTP couldn't route it and this is a straight line instead. The
   * map draws these dashed: substituting a straight line silently would bake an
   * invisible lie into the geometry, and refusing the waypoint would block an
   * operator who knows the road exists and that OSM is simply missing it.
   */
  straightLine: boolean;
}

export interface SnapResult {
  coordinates: [number, number][];
  segments: SnappedSegment[];
  /** How many segments fell back — surfaced so the operator can see it. */
  unsnappedCount: number;
}

const PLAN_QUERY = `
query Snap($from: InputCoordinates!, $to: InputCoordinates!) {
  plan(from: $from, to: $to, transportModes: [{ mode: CAR }], numItineraries: 1) {
    itineraries { legs { legGeometry { points } } }
  }
}`;

/** Straight line between two waypoints, for when the road network can't help. */
function straightSegment(a: Waypoint, b: Waypoint): SnappedSegment {
  return {
    coordinates: [
      [a.lon, a.lat],
      [b.lon, b.lat],
    ],
    straightLine: true,
  };
}

/** Ask OTP for the drivable path between two waypoints. */
export async function snapSegment(
  from: Waypoint,
  to: Waypoint,
): Promise<SnappedSegment> {
  try {
    const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        query: PLAN_QUERY,
        variables: { from, to },
      }),
    });
    const data = await res.json();
    const legs = (data?.data?.plan?.itineraries?.[0]?.legs ?? []) as {
      legGeometry: { points: string } | null;
    }[];

    const coords: [number, number][] = [];
    for (const leg of legs) {
      const pts = leg.legGeometry?.points;
      if (!pts) continue;
      for (const c of decodePolyline(pts)) {
        // OTP returns each leg with its own geometry; drop the duplicated
        // joint so the combined line has no zero-length span.
        const last = coords[coords.length - 1];
        if (!last || last[0] !== c[0] || last[1] !== c[1]) {
          coords.push(c as [number, number]);
        }
      }
    }
    if (coords.length < 2) return straightSegment(from, to);
    return { coordinates: coords, straightLine: false };
  } catch {
    return straightSegment(from, to);
  }
}

/**
 * Snap a whole waypoint list into one line.
 *
 * Segments are requested in parallel — an operator redrawing a 12-waypoint
 * corridor should not wait for eleven sequential OTP round trips.
 */
export async function snapWaypoints(
  waypoints: Waypoint[],
): Promise<SnapResult> {
  if (waypoints.length < 2) {
    return {
      coordinates: waypoints.map((w) => [w.lon, w.lat] as [number, number]),
      segments: [],
      unsnappedCount: 0,
    };
  }

  const pairs = waypoints.slice(0, -1).map((from, i) => ({
    from,
    to: waypoints[i + 1],
  }));
  const segments = await Promise.all(
    pairs.map(({ from, to }) => snapSegment(from, to)),
  );

  const coordinates: [number, number][] = [];
  for (const segment of segments) {
    for (const c of segment.coordinates) {
      const last = coordinates[coordinates.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) coordinates.push(c);
    }
  }

  return {
    coordinates,
    segments,
    unsnappedCount: segments.filter((s) => s.straightLine).length,
  };
}
