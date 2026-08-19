import { prisma } from "@/lib/prisma";

/** All stops as a GeoJSON FeatureCollection of points. */
export async function GET() {
  const stops = await prisma.stop.findMany({
    select: { id: true, name: true, nameAm: true, lat: true, lon: true },
  });

  const features = stops.map((s) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
    properties: { stopId: s.id, name: s.name, nameAm: s.nameAm },
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
