import type { NextRequest } from "next/server";
import { requirePermission } from "@/lib/session";
import { snapWaypoints, type Waypoint } from "@/lib/road-snap";
import { allowSnap } from "@/lib/snap-rate-limit";
import { shapeWaypointsSchema } from "@/actions/shape-edit-schema";

/**
 * Snap drawn waypoints to the road network.
 *
 * A POST rather than a GET because a corridor's waypoint list is too long and
 * too structured for a query string, and because caching a snap would be wrong:
 * the answer changes whenever the OSM graph is rebuilt.
 */
export async function POST(request: NextRequest) {
  const session = await requirePermission({ feedEdit: ["shape"] });

  // Each segment is an OTP round trip, and OTP also answers every rider's
  // journey plan. Throttle per operator so one drawing session can't starve it.
  const limit = allowSnap(session.user.id);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many snap requests — slow down for a moment" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = shapeWaypointsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid waypoints" },
      { status: 400 },
    );
  }

  const result = await snapWaypoints(parsed.data.waypoints as Waypoint[]);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
