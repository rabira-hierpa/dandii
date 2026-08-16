"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { snapWaypoints, type Waypoint } from "@/lib/road-snap";
import { requirePermission } from "@/lib/session";
import { shapeSaveSchema, type ShapeSaveInput } from "./shape-edit-schema";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Save an operator-drawn shape for one direction.
 *
 * Re-snaps server-side rather than trusting the geometry the browser sends. The
 * client already snapped it to draw the preview, but a client-supplied
 * LineString is client-supplied data: accepting it would let anyone with the
 * permission write arbitrary geometry into the published feed.
 */
export async function saveRouteShape(input: ShapeSaveInput) {
  const session = await requirePermission({ feedEdit: ["shape"] });

  let data;
  try {
    data = shapeSaveSchema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false as const,
        error: err.issues[0]?.message ?? "Invalid shape",
      };
    }
    throw err;
  }

  const route = await prisma.route.findUnique({
    where: { id: data.routeId },
    select: { id: true },
  });
  if (!route) return { ok: false as const, error: "Route not found" };

  const snapped = await snapWaypoints(data.waypoints as Waypoint[]);
  if (snapped.coordinates.length < 2) {
    return { ok: false as const, error: "Could not build a line from those points" };
  }

  const geojson = {
    type: "LineString",
    coordinates: snapped.coordinates,
  } as unknown as Prisma.InputJsonValue;

  await prisma.shapeOverride.upsert({
    where: {
      routeId_directionId: {
        routeId: data.routeId,
        directionId: data.directionId,
      },
    },
    create: {
      routeId: data.routeId,
      directionId: data.directionId,
      waypoints: data.waypoints as unknown as Prisma.InputJsonValue,
      geojson,
      editedById: session.user.id,
    },
    update: {
      waypoints: data.waypoints as unknown as Prisma.InputJsonValue,
      geojson,
      editedById: session.user.id,
    },
  });

  // Mirror onto the Shape rows this direction's trips use, so the console and
  // the rider map show the new line before the next publish.
  await mirrorOntoShapes(data.routeId, data.directionId, snapped.coordinates);

  revalidatePath("/console/network");
  revalidatePath("/api/geo/routes");
  return {
    ok: true as const,
    data: { unsnappedCount: snapped.unsnappedCount },
  };
}

/** Point the direction's Shape rows (and Route.geojson when outbound) at the new line. */
async function mirrorOntoShapes(
  routeId: string,
  directionId: number,
  coordinates: [number, number][],
): Promise<void> {
  const geojson = {
    type: "LineString",
    coordinates,
  } as unknown as Prisma.InputJsonValue;

  const shapeIds = [
    ...new Set(
      (
        await prisma.trip.findMany({
          where: { routeId, directionId, shapeId: { not: null } },
          select: { shapeId: true },
        })
      ).map((t) => t.shapeId as string),
    ),
  ];
  if (shapeIds.length > 0) {
    await prisma.shape.updateMany({
      where: { id: { in: shapeIds } },
      data: { geojson, geojsonSimplified: geojson },
    });
  }

  // The rider map draws the outbound shape (see prisma/seed/index.ts).
  if (directionId === 0) {
    await prisma.route.update({
      where: { id: routeId },
      data: { geojson, geojsonSimplified: geojson },
    });
  }
}
