import type { NextRequest } from "next/server";
import { findDirectRoutes, type DirectionsAnchor } from "@/lib/directions";
import { OPERATOR_CODES, type OperatorCode } from "@/lib/operators";
import { planTransferJourneys } from "@/lib/otp-fallback";
import { prisma } from "@/lib/prisma";

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

  // Resolve the two anchor stops (both endpoints are always DB stops).
  const stops = await prisma.stop.findMany({
    where: { id: { in: [fromId, toId] } },
    select: { id: true, name: true, lat: true, lon: true },
  });
  const origin = stops.find((s) => s.id === fromId);
  const destination = stops.find((s) => s.id === toId);
  if (!origin || !destination) {
    return Response.json({ error: "unknown stop" }, { status: 404 });
  }

  const anchorFrom: DirectionsAnchor = origin;
  const anchorTo: DirectionsAnchor = destination;
  const direct = await findDirectRoutes(anchorFrom, anchorTo, operators);

  // Only reach for OTP (transfers) when no single-seat ride covers the trip.
  const fallback =
    direct.length === 0
      ? await planTransferJourneys(anchorFrom, anchorTo, operators)
      : [];

  return Response.json({
    origin: anchorFrom,
    destination: anchorTo,
    direct,
    fallback,
  });
}
