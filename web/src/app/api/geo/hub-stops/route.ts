import { prisma } from "@/lib/prisma";

/** Major interchange stops ranked by how many routes serve them. */
export async function GET() {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      nameAm: string | null;
      lat: number;
      lon: number;
      route_count: number;
    }[]
  >`
    SELECT
      s.id,
      s.name,
      s."nameAm" AS "nameAm",
      s.lat,
      s.lon,
      COUNT(DISTINCT t."routeId")::int AS route_count
    FROM stop_time st
    INNER JOIN trip t ON t.id = st."tripId"
    INNER JOIN stop s ON s.id = st."stopId"
    GROUP BY s.id, s.name, s."nameAm", s.lat, s.lon
    ORDER BY route_count DESC
    LIMIT 40
  `;

  // One marker per destination name — GTFS often duplicates platform nodes.
  const seen = new Set<string>();
  const hubs = rows.filter((row) => {
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 18);

  const features = hubs.map((s) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
    properties: {
      stopId: s.id,
      name: s.name,
      nameAm: s.nameAm,
      routeCount: s.route_count,
    },
  }));

  return Response.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    },
  );
}
