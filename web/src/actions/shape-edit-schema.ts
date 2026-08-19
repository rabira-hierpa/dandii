import { z } from "zod";
import { ADDIS_BOUNDS } from "./stop-edit-schema";

export { ADDIS_BOUNDS };

const waypoint = z.object({
  lat: z.number().min(ADDIS_BOUNDS.minLat).max(ADDIS_BOUNDS.maxLat),
  lon: z.number().min(ADDIS_BOUNDS.minLon).max(ADDIS_BOUNDS.maxLon),
});

/**
 * A drawn line. Capped at 200 waypoints: past that the operator is tracing
 * vertices rather than placing decisions, and each one costs an OTP round trip.
 */
export const shapeWaypointsSchema = z.object({
  waypoints: z.array(waypoint).min(2).max(200),
});

export const shapeSaveSchema = z.object({
  routeId: z.string().min(1),
  directionId: z.number().int().min(0).max(1),
  waypoints: z.array(waypoint).min(2).max(200),
});

export const shapeResetSchema = z.object({
  routeId: z.string().min(1),
  directionId: z.number().int().min(0).max(1),
});

/** The cap the editor enforces locally, so a 201st click never round-trips. */
export const MAX_WAYPOINTS = 200;

export type ShapeSaveInput = z.input<typeof shapeSaveSchema>;
export type ShapeResetInput = z.input<typeof shapeResetSchema>;
