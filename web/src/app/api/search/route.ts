import type { NextRequest } from "next/server";
import { OPERATOR_CODES, type OperatorCode } from "@/lib/operators";
import { prisma } from "@/lib/prisma";

const OPERATOR_SET = new Set<string>(OPERATOR_CODES);

interface StopResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Lightweight search across routes and stops for the public map. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ routes: [], stops: [] });
  }

  // Optional agency filter: ?operators=ANBESSA,SHEGER (unknown codes ignored).
  const operators = (request.nextUrl.searchParams.get("operators") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => OPERATOR_SET.has(c)) as OperatorCode[];
  const filtering = operators.length > 0;

  // Stops aren't tied to an agency, so an agency filter narrows to routes only.
  const stopsPromise: Promise<StopResult[]> = filtering
    ? Promise.resolve([])
    : prisma.stop.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true, name: true, lat: true, lon: true },
        take: 8,
        orderBy: { name: "asc" },
      });

  const [routes, stops] = await Promise.all([
    prisma.route.findMany({
      where: {
        OR: [
          { shortName: { contains: q, mode: "insensitive" } },
          { longName: { contains: q, mode: "insensitive" } },
        ],
        ...(filtering
          ? { assignment: { operator: { code: { in: operators } } } }
          : {}),
      },
      select: {
        id: true,
        shortName: true,
        longName: true,
        assignment: { select: { operator: { select: { code: true } } } },
      },
      take: 8,
      orderBy: { shortName: "asc" },
    }),
    stopsPromise,
  ]);

  return Response.json({
    routes: routes.map((r) => ({
      id: r.id,
      shortName: r.shortName,
      longName: r.longName,
      operatorCode: r.assignment?.operator.code ?? null,
    })),
    stops,
  });
}
