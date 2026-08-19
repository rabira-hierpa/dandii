import { prisma } from "@/lib/prisma";
import { activeClosureFilter } from "@/lib/transit";

/** Lightweight route preview for map hover — stops and operator only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ routeId: string }> },
) {
  const { routeId } = await params;

  const route = await prisma.route.findUnique({
    where: { id: routeId },
    select: {
      id: true,
      shortName: true,
      longName: true,
      type: true,
      geojson: true,
      assignment: { select: { operator: { select: { code: true } } } },
      closures: {
        where: activeClosureFilter(),
        select: { id: true },
        take: 1,
      },
      trips: {
        take: 1,
        select: {
          stopTimes: {
            orderBy: { sequence: "asc" },
            select: {
              sequence: true,
              stop: {
                select: {
                  id: true,
                  name: true,
                  // Without this the map falls back to the English name for
                  // every stop on a selected route, however many Amharic
                  // names the console holds. `nameAm` is optional on the
                  // client types, so dropping it here type-checks cleanly.
                  nameAm: true,
                  lat: true,
                  lon: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!route) {
    return Response.json({ error: "Route not found" }, { status: 404 });
  }

  const trip = route.trips[0];
  return Response.json(
    {
      id: route.id,
      shortName: route.shortName,
      longName: route.longName,
      routeType: route.type,
      geojson: route.geojson,
      operatorCode: route.assignment?.operator.code ?? null,
      closed: route.closures.length > 0,
      stops: trip?.stopTimes.map((st) => st.stop) ?? [],
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}
