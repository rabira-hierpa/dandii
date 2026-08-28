import type { NextRequest } from "next/server";
import {
  resolveClosedWindow,
  type ClosureRange,
  type TripStop,
} from "@/lib/closures";
import { findDirectRoutes, type DirectionsAnchor } from "@/lib/directions";
import { OPERATOR_CODES, type OperatorCode } from "@/lib/operators";
import { planTransferJourneys } from "@/lib/otp-fallback";
import { prisma } from "@/lib/prisma";
import { getActiveClosures, otpBanRouteIds } from "@/lib/transit";

const OPERATOR_SET = new Set<string>(OPERATOR_CODES);

/**
 * Journey planner. Primary path: single-seat "direct routes" matched from our
 * own GTFS data (see lib/directions.ts), operator-ranked and agency-filterable.
 * The transfer fallback (OTP) is layered on when no direct route exists.
 *
 * Query params: from, to (stop ids); operators (csv of operator codes).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fromId = params.get("from")?.trim();
  const toId = params.get("to")?.trim();
  if (!fromId || !toId) {
    return Response.json({ error: "from and to are required" }, { status: 400 });
  }
  if (fromId === toId) {
    return Response.json({ error: "from and to must differ" }, { status: 400 });
  }

  const operators = (params.get("operators") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => OPERATOR_SET.has(c)) as OperatorCode[];

  const stops = await prisma.stop.findMany({
    where: { id: { in: [fromId, toId] } },
    select: { id: true, name: true, nameAm: true, lat: true, lon: true },
  });
  const origin = stops.find((s) => s.id === fromId);
  const destination = stops.find((s) => s.id === toId);
  if (!origin || !destination) {
    return Response.json({ error: "unknown stop" }, { status: 404 });
  }

  const anchorFrom: DirectionsAnchor = origin;
  const anchorTo: DirectionsAnchor = destination;
  const direct = await findDirectRoutes(anchorFrom, anchorTo, operators);

  let fallback: Awaited<ReturnType<typeof planTransferJourneys>> = [];
  if (direct.length === 0) {
    const active = await getActiveClosures();
    const bannedRouteIds = otpBanRouteIds(active);
    const skippedStopNames = await skippedStopNameSet(active);

    fallback = await planTransferJourneys(anchorFrom, anchorTo, {
      operators,
      bannedRouteIds,
      skippedStopNames,
    });
  }

  return Response.json({
    origin: anchorFrom,
    destination: anchorTo,
    direct,
    fallback,
  });
}

/** Lowercased stop names inside every active SKIPPED closure range. */
async function skippedStopNameSet(
  active: Awaited<ReturnType<typeof getActiveClosures>>,
): Promise<Set<string>> {
  const skipped = active.filter((c) => c.kind === "SKIPPED");
  const names = new Set<string>();
  if (skipped.length === 0) return names;

  // Boundary coordinates, so a closure entered against one direction still
  // resolves on the canonical trip. Matching by id alone failed outright here
  // whenever the two differed, and then nothing was filtered at all.
  const boundaryIds = [
    ...new Set(
      skipped.flatMap((c) =>
        [c.fromStopId, c.toStopId].filter((s): s is string => Boolean(s)),
      ),
    ),
  ];
  const anchors = new Map(
    (
      await prisma.stop.findMany({
        where: { id: { in: boundaryIds } },
        select: { id: true, lat: true, lon: true },
      })
    ).map((s) => [s.id, { lat: s.lat, lon: s.lon }]),
  );

  for (const c of skipped) {
    if (!c.fromStopId || !c.toStopId) continue;
    const trip = await prisma.trip.findFirst({
      where: { routeId: c.routeId },
      orderBy: { id: "asc" },
      select: {
        stopTimes: {
          orderBy: { sequence: "asc" },
          select: {
            stop: { select: { id: true, name: true, lat: true, lon: true } },
          },
        },
      },
    });
    if (!trip) continue;
    const stopNames = trip.stopTimes.map((st) => st.stop);
    const range: ClosureRange = {
      kind: "SKIPPED",
      fromStopId: c.fromStopId,
      toStopId: c.toStopId,
    };
    // Sequence is the array index here, because the window is used to slice
    // this list rather than to compare against stop_time sequences.
    const stops: TripStop[] = stopNames.map((s, i) => ({
      id: s.id,
      sequence: i,
      lat: s.lat,
      lon: s.lon,
    }));
    const w = resolveClosedWindow(range, stops, undefined, anchors);
    if (!w) continue;
    for (const s of stopNames.slice(w.start, w.end + 1)) {
      names.add(s.name.trim().toLowerCase());
    }
  }
  return names;
}
