"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { snapWaypoints, type Waypoint } from "@/lib/road-snap";
import { requirePermission } from "@/lib/session";
import { denyOutOfScope } from "@/lib/operator-scope";
import {
  shapeResetSchema,
  shapeSaveSchema,
  type ShapeResetInput,
  type ShapeSaveInput,
} from "./shape-edit-schema";
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

  const denied = await denyOutOfScope(session.user.id, {
    routeId: data.routeId,
  });
  if (denied) return denied;

  const route = await prisma.route.findUnique({
    where: { id: data.routeId },
    select: { id: true },
  });
  if (!route) return { ok: false as const, error: "Route not found" };

  // Nothing to mirror onto means the drawing would be stored and never drawn:
  // the console map renders trips that carry a shapeId, so a direction with no
  // trips would save "successfully" and leave the map unchanged. Refuse loudly
  // instead — a silent success is worse than an error.
  const shapeIds = await directionShapeIds(data.routeId, data.directionId);
  if (shapeIds.length === 0) {
    return {
      ok: false as const,
      error:
        "This direction has no trips to attach a shape to — add a trip first",
    };
  }

  const snapped = await snapWaypoints(data.waypoints as Waypoint[]);
  if (snapped.coordinates.length < 2) {
    return { ok: false as const, error: "Could not build a line from those points" };
  }

  const geojson = {
    type: "LineString",
    coordinates: snapped.coordinates,
  } as unknown as Prisma.InputJsonValue;

  // Captured once, on the first edit only: mirroring overwrites Shape.geojson in
  // place, so without this the feed's own line is gone and "reset" would have
  // nothing to put back short of a full reseed.
  const baseGeojson = await captureBaseGeojson(
    data.routeId,
    data.directionId,
    shapeIds[0],
  );

  try {
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
        baseGeojson,
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
    await mirrorOntoShapes(data.routeId, data.directionId, shapeIds, geojson);
  } catch {
    // Server Actions must never throw across the boundary (CLAUDE.md §7).
    return { ok: false as const, error: "Couldn't save the shape" };
  }

  revalidatePath("/console/network");
  revalidatePath("/api/geo/routes");
  return {
    ok: true as const,
    data: { unsnappedCount: snapped.unsnappedCount },
  };
}

/**
 * Drop an operator-drawn shape and put the feed's geometry back.
 *
 * Deleting the override alone would leave the mirrored `Shape` rows holding the
 * drawing, so the map would keep showing a line the database no longer claims
 * as an edit. The feed geometry is re-read from the untouched `ShapeOverride`
 * base — i.e. whatever the last seed wrote — via a reseed of these shape ids.
 */
export async function resetRouteShape(input: ShapeResetInput) {
  const session = await requirePermission({ feedEdit: ["shape"] });

  let data;
  try {
    data = shapeResetSchema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false as const,
        error: err.issues[0]?.message ?? "Invalid request",
      };
    }
    throw err;
  }

  const denied = await denyOutOfScope(session.user.id, {
    routeId: data.routeId,
  });
  if (denied) return denied;

  const existing = await prisma.shapeOverride.findUnique({
    where: {
      routeId_directionId: {
        routeId: data.routeId,
        directionId: data.directionId,
      },
    },
    select: { baseGeojson: true },
  });
  if (!existing) {
    return { ok: false as const, error: "This direction has no drawn shape" };
  }
  if (!existing.baseGeojson) {
    return {
      ok: false as const,
      error: "The original geometry wasn't captured — reseed to restore it",
    };
  }

  const shapeIds = await directionShapeIds(data.routeId, data.directionId);

  try {
    await prisma.shapeOverride.delete({
      where: {
        routeId_directionId: {
          routeId: data.routeId,
          directionId: data.directionId,
        },
      },
    });
    if (shapeIds.length > 0) {
      await mirrorOntoShapes(
        data.routeId,
        data.directionId,
        shapeIds,
        existing.baseGeojson as Prisma.InputJsonValue,
      );
    }
  } catch {
    return { ok: false as const, error: "Couldn't reset the shape" };
  }

  revalidatePath("/console/network");
  revalidatePath("/api/geo/routes");
  return { ok: true as const, data: { restored: shapeIds.length } };
}

/** Distinct shape ids the trips in one direction point at. */
async function directionShapeIds(
  routeId: string,
  directionId: number,
): Promise<string[]> {
  const trips = await prisma.trip.findMany({
    where: { routeId, directionId, shapeId: { not: null } },
    select: { shapeId: true },
  });
  return [...new Set(trips.map((t) => t.shapeId as string))];
}

/**
 * The geometry these shape rows held before the first operator edit. Returns
 * null when an override already exists — the base is captured once and never
 * re-captured, or the second save would record the first drawing as "the feed".
 */
async function captureBaseGeojson(
  routeId: string,
  directionId: number,
  shapeId: string,
): Promise<Prisma.InputJsonValue | undefined> {
  const existing = await prisma.shapeOverride.findUnique({
    where: { routeId_directionId: { routeId, directionId } },
    select: { routeId: true },
  });
  if (existing) return undefined;

  const shape = await prisma.shape.findUnique({
    where: { id: shapeId },
    select: { geojson: true },
  });
  return (shape?.geojson ?? undefined) as Prisma.InputJsonValue | undefined;
}

/** Point the direction's Shape rows (and Route.geojson when outbound) at a line. */
async function mirrorOntoShapes(
  routeId: string,
  directionId: number,
  shapeIds: string[],
  geojson: Prisma.InputJsonValue,
): Promise<void> {
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
