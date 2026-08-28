/**
 * Direct-route (single-seat ride) matching for the public journey planner.
 *
 * WHY this exists instead of leaning on OTP: the GTFS feed fragments every
 * real place into many nearby stops (e.g. "Megenagna" is 45 distinct stops —
 * the LRT platform and the minibus terminal are separate nodes 139 m apart),
 * and the OTP graph is transit-only (no OSM streets), so OTP plans strictly
 * stop-to-stop and can't walk between a fragmented place's sibling stops. The
 * result: whichever exact stop the rider happened to pick decides which
 * operators are even considered, so a direct minibus that stops 139 m away is
 * invisible and OTP falls back to LRT with a geometry-less (broken) walk leg.
 *
 * This module instead answers the question riders actually ask — "which line
 * goes from near A to near B?" — directly from our own DB: cluster the origin
 * and destination into nearby stops, find every route that serves an origin
 * stop *before* a destination stop on the same trip (a single-seat ride),
 * then rank operator-first (minibus → sheger → anbessa → …). In-vehicle time
 * comes from the real GTFS stop_time offsets; wait time from the route's
 * headway. Transfers (no direct match) fall back to OTP — see the API route.
 */
import length from "@turf/length";
import { lineString } from "@turf/helpers";
import { decodePolyline } from "@/components/map/polyline";
import {
  CLOSURE_SNAP_TOLERANCE_M,
  isPairBlocked,
  resolveClosedWindow,
  type ClosureRange,
  type TripStop,
} from "@/lib/closures";
import type {
  DirectionsAnchor,
  DirectRoute,
} from "@/components/map/types";
import { OPERATOR_META, type OperatorCode } from "@/lib/operators";
import { prisma } from "@/lib/prisma";

export type { DirectionsAnchor, DirectRoute };

const OTP_URL = process.env.OTP_URL ?? "http://localhost:8080";

/** Metres a rider is assumed willing to walk to/from a stop at each end. */
const CLUSTER_RADIUS_M = 500;
/** Average walking speed (~4.8 km/h) for the walk-time estimate. */
const WALK_SPEED_MPS = 1.33;

/**
 * Ranking priority — lower is shown first. Minibuses dominate Addis travel and
 * are the rider default; Anbessa floats to the top automatically whenever no
 * minibus/sheger route covers the corridor (they simply won't be in the list).
 */
const OPERATOR_PRIORITY: Record<OperatorCode, number> = {
  MINIBUS: 0,
  SHEGER: 1,
  ANBESSA: 2,
  ALLIANCE: 3,
  LRT: 4,
};

interface ClusterStop {
  id: string;
  name: string;
  nameAm: string | null;
  lat: number;
  lon: number;
  /** Great-circle metres from the anchor. */
  dist: number;
}

interface MatchRow {
  routeId: string;
  tripId: string;
  boardStop: string;
  boardSeq: number;
  boardDep: string | null;
  alightStop: string;
  alightSeq: number;
  alightArr: string | null;
  headwaySecs: number | null;
}

/** Haversine distance in metres. */
export function haversineMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Parse a GTFS "HH:MM:SS" time (may exceed 24h) into seconds since midnight. */
export function parseGtfsTime(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = parts.length > 2 ? Number(parts[2]) : 0;
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

/** Stops within CLUSTER_RADIUS_M of an anchor, nearest first. */
async function clusterStops(anchor: DirectionsAnchor): Promise<ClusterStop[]> {
  const latDelta = CLUSTER_RADIUS_M / 111_320;
  const lonDelta =
    CLUSTER_RADIUS_M / (111_320 * Math.cos((anchor.lat * Math.PI) / 180));
  const box = await prisma.stop.findMany({
    where: {
      lat: { gte: anchor.lat - latDelta, lte: anchor.lat + latDelta },
      lon: { gte: anchor.lon - lonDelta, lte: anchor.lon + lonDelta },
    },
    select: { id: true, name: true, nameAm: true, lat: true, lon: true },
  });
  const near: ClusterStop[] = [];
  for (const s of box) {
    const dist = haversineMeters(anchor.lat, anchor.lon, s.lat, s.lon);
    if (dist <= CLUSTER_RADIUS_M) near.push({ ...s, dist });
  }
  // The anchor stop itself is always included (dist 0); guarantees non-empty.
  if (!near.some((s) => s.id === anchor.id)) {
    near.push({
      id: anchor.id,
      name: anchor.name,
      nameAm: anchor.nameAm ?? null,
      lat: anchor.lat,
      lon: anchor.lon,
      dist: 0,
    });
  }
  near.sort((a, b) => a.dist - b.dist);
  return near;
}

/** How close a shape vertex must be to a stop for the shape to be trusted. */
const SHAPE_SNAP_TOLERANCE_M = 250;

/**
 * Geometry for the board→alight leg, drawn on the map.
 *
 * The stored route `geojson` is prettier (dense, road-following) but not always
 * trustworthy: some feed routes carry a shape that doesn't actually pass
 * through their own stops (e.g. Tx Kal 033's shape sits in Kaliti while it
 * serves Bole/Megenagna stops). So we slice the shape only when it genuinely
 * snaps near BOTH endpoints; otherwise we fall back to the polyline through the
 * actually-served stops, which is always correct if coarser.
 */
export function legGeometry(
  shape: GeoJSON.LineString | null,
  board: { lat: number; lon: number },
  alight: { lat: number; lon: number },
  stopPolyline: GeoJSON.Position[],
): { shape: GeoJSON.LineString; fellBack: boolean } {
  const fallback = {
    shape: {
      type: "LineString" as const,
      coordinates:
        stopPolyline.length >= 2
          ? stopPolyline
          : [
              [board.lon, board.lat],
              [alight.lon, alight.lat],
            ],
    },
    // The feed shape didn't cover this leg — the stop polyline cuts across
    // blocks, so this leg is a candidate for street-snapping via OTP.
    fellBack: true,
  };
  const coords = shape?.coordinates;
  if (!coords || coords.length < 2) return fallback;

  const nearest = (lat: number, lon: number) => {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = (coords[i][0] - lon) ** 2 + (coords[i][1] - lat) ** 2;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const i = nearest(board.lat, board.lon);
  const j = nearest(alight.lat, alight.lon);
  // Reject the shape if either endpoint doesn't actually lie on it.
  const boardGap = haversineMeters(board.lat, board.lon, coords[i][1], coords[i][0]);
  const alightGap = haversineMeters(alight.lat, alight.lon, coords[j][1], coords[j][0]);
  if (
    boardGap > SHAPE_SNAP_TOLERANCE_M ||
    alightGap > SHAPE_SNAP_TOLERANCE_M ||
    i === j
  ) {
    return fallback;
  }

  const segment: GeoJSON.Position[] =
    i <= j ? coords.slice(i, j + 1) : coords.slice(j, i + 1).reverse();
  return {
    shape: {
      type: "LineString",
      coordinates: [[board.lon, board.lat], ...segment, [alight.lon, alight.lat]],
    },
    fellBack: false,
  };
}

// In-memory cache of street-snapped legs, keyed by rounded endpoints. Persists
// for the life of the server process; repeat ODs are then free.
const streetLegCache = new Map<string, GeoJSON.LineString | null>();

/**
 * Route a leg over OTP's OSM street graph (WALK mode) so a leg whose feed shape
 * is missing/wrong follows roads instead of cutting straight across blocks.
 * Returns null when OTP can't route it (keep the straight fallback then).
 */
async function snapLegToStreets(
  board: { lat: number; lon: number },
  alight: { lat: number; lon: number },
): Promise<GeoJSON.LineString | null> {
  const key = `${board.lat.toFixed(5)},${board.lon.toFixed(5)}>${alight.lat.toFixed(5)},${alight.lon.toFixed(5)}`;
  const cached = streetLegCache.get(key);
  if (cached !== undefined) return cached;
  const query = `{ plan(from:{lat:${board.lat},lon:${board.lon}}, to:{lat:${alight.lat},lon:${alight.lon}}, transportModes:[{mode:WALK}], numItineraries:1){ itineraries{ legs{ legGeometry{ points } } } } }`;
  let shape: GeoJSON.LineString | null = null;
  try {
    const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const legs = (data?.data?.plan?.itineraries?.[0]?.legs ?? []) as {
      legGeometry: { points: string } | null;
    }[];
    const coords = legs.flatMap((l) =>
      l.legGeometry?.points ? decodePolyline(l.legGeometry.points) : [],
    );
    if (coords.length >= 2) shape = { type: "LineString", coordinates: coords };
  } catch {
    // OTP unavailable — leave the straight fallback in place.
  }
  streetLegCache.set(key, shape);
  return shape;
}

export function tierFareEtb(
  tiers: { fromKm: number; toKm: number | null; amountEtb: number }[],
  km: number,
): number | null {
  for (const t of tiers) {
    const within = km >= t.fromKm && (t.toKm == null || km <= t.toKm);
    if (within) return t.amountEtb;
  }
  // Beyond the last band: use the highest-priced tier.
  const last = tiers[tiers.length - 1];
  return last ? last.amountEtb : null;
}

export interface DirectionsResult {
  origin: DirectionsAnchor;
  destination: DirectionsAnchor;
  direct: DirectRoute[];
}

/**
 * Find single-seat rides from `origin` to `destination`, operator-ranked.
 * `operators`, when non-empty, restricts results to those operator codes.
 */

/**
 * Trip calls and boundary coordinates needed to place a closure on a trip.
 *
 * A closure stores two stop ids, and looking them up directly resolves on one
 * direction only: 406 of the 444 two-direction routes in the feed share NO stop
 * ids between their directions, because each side of a road is its own stop. A
 * closure entered against outbound stops therefore left the return journey
 * planning straight through the blocked stretch. Resolving by position fixes
 * that, and costs one wider query paid only while a closure is active.
 */
async function loadClosureGeometry(
  candidateTripIds: string[],
  activeClosures: { fromStopId: string | null; toStopId: string | null }[],
): Promise<{
  stopsByTrip: Map<string, TripStop[]>;
  anchors: Map<string, { lat: number; lon: number }>;
}> {
  const stopsByTrip = new Map<string, TripStop[]>();
  const anchors = new Map<string, { lat: number; lon: number }>();

  const boundaryStopIds = [
    ...new Set(
      activeClosures.flatMap((c) =>
        [c.fromStopId, c.toStopId].filter((s): s is string => Boolean(s)),
      ),
    ),
  ];
  const tripIds = [...new Set(candidateTripIds)];
  if (boundaryStopIds.length === 0 || tripIds.length === 0) {
    return { stopsByTrip, anchors };
  }

  const [callRows, boundaryStops] = await Promise.all([
    prisma.$queryRaw<
      {
        tripId: string;
        stopId: string;
        sequence: number;
        lat: number;
        lon: number;
      }[]
    >`
      SELECT st."tripId" AS "tripId", st."stopId" AS "stopId",
             st.sequence AS "sequence", s.lat AS "lat", s.lon AS "lon"
      FROM stop_time st
      JOIN stop s ON s.id = st."stopId"
      WHERE st."tripId" = ANY(${tripIds})
    `,
    prisma.stop.findMany({
      where: { id: { in: boundaryStopIds } },
      select: { id: true, lat: true, lon: true },
    }),
  ]);

  for (const b of boundaryStops) {
    anchors.set(b.id, { lat: b.lat, lon: b.lon });
  }
  for (const c of callRows) {
    const list = stopsByTrip.get(c.tripId) ?? [];
    list.push({ id: c.stopId, sequence: c.sequence, lat: c.lat, lon: c.lon });
    stopsByTrip.set(c.tripId, list);
  }
  return { stopsByTrip, anchors };
}

export async function findDirectRoutes(
  origin: DirectionsAnchor,
  destination: DirectionsAnchor,
  operators: OperatorCode[] = [],
): Promise<DirectRoute[]> {
  const [originCluster, destCluster] = await Promise.all([
    clusterStops(origin),
    clusterStops(destination),
  ]);
  const originById = new Map(originCluster.map((s) => [s.id, s]));
  const destById = new Map(destCluster.map((s) => [s.id, s]));
  const originIds = originCluster.map((s) => s.id);
  const destIds = destCluster.map((s) => s.id);

  // Every (board, alight) pair on the same trip where an origin-cluster stop
  // precedes a destination-cluster stop — i.e. a rideable single-seat leg.
  const rows = await prisma.$queryRaw<MatchRow[]>`
    SELECT t."routeId"     AS "routeId",
           so."tripId"     AS "tripId",
           so."stopId"     AS "boardStop",
           so.sequence     AS "boardSeq",
           so.departure    AS "boardDep",
           sd."stopId"     AS "alightStop",
           sd.sequence     AS "alightSeq",
           sd.arrival      AS "alightArr",
           f."headwaySecs" AS "headwaySecs"
    FROM stop_time so
    JOIN stop_time sd
      ON sd."tripId" = so."tripId" AND sd.sequence > so.sequence
    JOIN trip t ON t.id = so."tripId"
    LEFT JOIN frequency f ON f."tripId" = so."tripId"
    WHERE so."stopId" = ANY(${originIds}) AND sd."stopId" = ANY(${destIds})
  `;
  if (rows.length === 0) return [];

  // --- Closure enforcement -------------------------------------------------
  // Drop (board, alight) pairs that an active closure makes unrideable. Until
  // this existed, closures only tagged results and the planner still offered
  // them, so a fully closed route was still recommended.
  const candidateRouteIds = [...new Set(rows.map((r) => r.routeId))];
  const nowTs = new Date();
  const activeClosures = await prisma.routeClosure.findMany({
    where: {
      routeId: { in: candidateRouteIds },
      startsAt: { lte: nowTs },
      endsAt: { gte: nowTs },
    },
    select: { routeId: true, kind: true, fromStopId: true, toStopId: true },
  });

  let openRows = rows;
  if (activeClosures.length > 0) {
    const closuresByRoute = new Map<string, ClosureRange[]>();
    for (const c of activeClosures) {
      const list = closuresByRoute.get(c.routeId) ?? [];
      list.push({
        kind: c.kind as ClosureRange["kind"],
        fromStopId: c.fromStopId,
        toStopId: c.toStopId,
      });
      closuresByRoute.set(c.routeId, list);
    }

    const { stopsByTrip, anchors } = await loadClosureGeometry(
      rows.filter((r) => closuresByRoute.has(r.routeId)).map((r) => r.tripId),
      activeClosures,
    );

    openRows = rows.filter((row) => {
      const closures = closuresByRoute.get(row.routeId);
      if (!closures) return true;
      const stops = stopsByTrip.get(row.tripId) ?? [];
      // openRows keeps what a rider can still use, so this is the negation.
      return !closures.some((c) =>
        isPairBlocked(
          c,
          resolveClosedWindow(c, stops, CLOSURE_SNAP_TOLERANCE_M, anchors),
          row.boardSeq,
          row.alightSeq,
        ),
      );
    });
    if (openRows.length === 0) return [];
  }

  // Per route, keep the single best (board, alight, trip) by total time.
  interface Best {
    row: MatchRow;
    board: ClusterStop;
    alight: ClusterStop;
    walkSecs: number;
    waitSecs: number;
    inVehicleSecs: number;
    totalSecs: number;
  }
  const bestByRoute = new Map<string, Best>();
  for (const row of openRows) {
    const board = originById.get(row.boardStop);
    const alight = destById.get(row.alightStop);
    if (!board || !alight) continue;
    const dep = parseGtfsTime(row.boardDep);
    const arr = parseGtfsTime(row.alightArr);
    // Fall back to a coarse speed estimate only if offsets are missing.
    const inVehicleSecs =
      dep != null && arr != null && arr > dep ? arr - dep : 0;
    const waitSecs = row.headwaySecs != null ? row.headwaySecs / 2 : 300;
    const walkSecs = (board.dist + alight.dist) / WALK_SPEED_MPS;
    const totalSecs = walkSecs + waitSecs + inVehicleSecs;
    const prev = bestByRoute.get(row.routeId);
    if (!prev || totalSecs < prev.totalSecs) {
      bestByRoute.set(row.routeId, {
        row,
        board,
        alight,
        walkSecs,
        waitSecs,
        inVehicleSecs,
        totalSecs,
      });
    }
  }
  if (bestByRoute.size === 0) return [];

  // Hydrate route metadata (operator, shape, fare, headsign, closure) once.
  const routeIds = [...bestByRoute.keys()];
  const now = new Date();
  const routeRows = await prisma.route.findMany({
    where: { id: { in: routeIds } },
    select: {
      id: true,
      shortName: true,
      longName: true,
      geojson: true,
      assignment: { select: { operator: { select: { code: true, name: true } } } },
      fare: {
        select: {
          kind: true,
          flatAmountEtb: true,
          tiers: {
            select: { fromKm: true, toKm: true, amountEtb: true },
            orderBy: { fromKm: "asc" },
          },
        },
      },
      closures: {
        where: { startsAt: { lte: now }, endsAt: { gte: now } },
        select: { id: true, kind: true },
      },
    },
  });
  const routeById = new Map(routeRows.map((r) => [r.id, r]));

  // Headsign for the matched trip (nice-to-have direction label).
  const tripIds = [...bestByRoute.values()].map((b) => b.row.tripId);
  const trips = await prisma.trip.findMany({
    where: { id: { in: tripIds } },
    select: { id: true, headsign: true },
  });
  const headsignByTrip = new Map(trips.map((t) => [t.id, t.headsign]));

  // Ordered served stops for each matched trip — both the authoritative path
  // when the route's smooth shape doesn't cover its own stops, AND the
  // stop-by-stop list shown on each result card.
  const stopSeqRows = await prisma.$queryRaw<
    {
      tripId: string;
      sequence: number;
      id: string;
      name: string;
      nameAm: string | null;
      lat: number;
      lon: number;
    }[]
  >`
    SELECT st."tripId" AS "tripId", st.sequence AS "sequence",
           s.id AS "id", s.name AS "name", s."nameAm" AS "nameAm",
           s.lat AS "lat", s.lon AS "lon"
    FROM stop_time st
    JOIN stop s ON s.id = st."stopId"
    WHERE st."tripId" = ANY(${tripIds})
    ORDER BY st."tripId", st.sequence
  `;
  type SeqStop = {
    sequence: number;
    id: string;
    name: string;
    nameAm: string | null;
    lat: number;
    lon: number;
  };
  const stopsByTrip = new Map<string, SeqStop[]>();
  for (const r of stopSeqRows) {
    const list = stopsByTrip.get(r.tripId) ?? [];
    list.push({
      sequence: r.sequence,
      id: r.id,
      name: r.name,
      nameAm: r.nameAm,
      lat: r.lat,
      lon: r.lon,
    });
    stopsByTrip.set(r.tripId, list);
  }

  const filterSet = new Set<OperatorCode>(operators);

  // Pass 1: assemble each route's leg, noting which ones fell back to a
  // straight stop-polyline (feed shape didn't cover the leg).
  interface Draft {
    routeId: string;
    best: Best;
    meta: NonNullable<ReturnType<typeof routeById.get>>;
    code: OperatorCode | null;
    legStops: SeqStop[];
    shape: GeoJSON.LineString;
    fellBack: boolean;
  }
  const drafts: Draft[] = [];
  for (const [routeId, best] of bestByRoute) {
    const meta = routeById.get(routeId);
    if (!meta) continue;
    const code = meta.assignment?.operator.code ?? null;
    if (filterSet.size > 0 && (!code || !filterSet.has(code))) continue;

    const legStops = (stopsByTrip.get(best.row.tripId) ?? []).filter(
      (s) => s.sequence >= best.row.boardSeq && s.sequence <= best.row.alightSeq,
    );
    const stopPolyline: GeoJSON.Position[] = legStops.map(
      (s) => [s.lon, s.lat] as GeoJSON.Position,
    );
    const geom = legGeometry(
      (meta.geojson as GeoJSON.LineString | null) ?? null,
      best.board,
      best.alight,
      stopPolyline,
    );
    drafts.push({
      routeId,
      best,
      meta,
      code,
      legStops,
      shape: geom.shape,
      fellBack: geom.fellBack,
    });
  }

  // Pass 2: street-snap the fell-back legs over OTP concurrently (cached), so
  // their lines follow roads instead of cutting across blocks.
  await Promise.all(
    drafts
      .filter((d) => d.fellBack)
      .map(async (d) => {
        const snapped = await snapLegToStreets(d.best.board, d.best.alight);
        if (snapped) d.shape = snapped;
      }),
  );

  // Pass 3: finalize fare (from the final shape length) and build results.
  const results: DirectRoute[] = drafts.map((d) => {
    const { best, meta, code } = d;
    const rideKm = length(lineString(d.shape.coordinates), {
      units: "kilometers",
    });
    let fareEtb: number | null = null;
    if (meta.fare) {
      if (meta.fare.kind === "FLAT") {
        fareEtb = meta.fare.flatAmountEtb
          ? Number(meta.fare.flatAmountEtb)
          : null;
      } else {
        fareEtb = tierFareEtb(
          meta.fare.tiers.map((t) => ({
            fromKm: t.fromKm,
            toKm: t.toKm,
            amountEtb: Number(t.amountEtb),
          })),
          rideKm,
        );
      }
    }
    return {
      routeId: d.routeId,
      shortName: meta.shortName,
      longName: meta.longName,
      operator: code
        ? { code, name: meta.assignment!.operator.name, color: OPERATOR_META[code].color }
        : null,
      headsign: headsignByTrip.get(best.row.tripId) ?? null,
      board: {
        id: best.board.id,
        name: best.board.name,
        nameAm: best.board.nameAm,
        lat: best.board.lat,
        lon: best.board.lon,
      },
      alight: {
        id: best.alight.id,
        name: best.alight.name,
        nameAm: best.alight.nameAm,
        lat: best.alight.lat,
        lon: best.alight.lon,
      },
      stops: d.legStops.map((s) => ({
        id: s.id,
        name: s.name,
        nameAm: s.nameAm,
        lat: s.lat,
        lon: s.lon,
      })),
      walkToBoardMeters: Math.round(best.board.dist),
      walkFromAlightMeters: Math.round(best.alight.dist),
      numStops: best.row.alightSeq - best.row.boardSeq,
      inVehicleSecs: Math.round(best.inVehicleSecs),
      waitSecs: Math.round(best.waitSecs),
      walkSecs: Math.round(best.walkSecs),
      totalSecs: Math.round(best.totalSecs),
      rideKm: Number(rideKm.toFixed(2)),
      fareEtb,
      shape: d.shape,
      // Only whole-route outages mark the suggested ride as "closed". A
      // partial closure that still allows this (board, alight) pair is open.
      closed: meta.closures.some((c) => c.kind === "WHOLE_ROUTE"),
    };
  });

  // Operator-first, then fastest total time within an operator.
  results.sort((a, b) => {
    const pa = a.operator ? OPERATOR_PRIORITY[a.operator.code] : 99;
    const pb = b.operator ? OPERATOR_PRIORITY[b.operator.code] : 99;
    if (pa !== pb) return pa - pb;
    return a.totalSecs - b.totalSecs;
  });
  return results;
}
