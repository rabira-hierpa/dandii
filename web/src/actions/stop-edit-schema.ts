import { z } from "zod";

/** Addis, generously bounded — a typo'd coordinate should not land in Kenya. */
const ADDIS_BOUNDS = { minLat: 8.7, maxLat: 9.3, minLon: 38.4, maxLon: 39.1 };

const lat = z
  .number()
  .min(ADDIS_BOUNDS.minLat, "Latitude is outside Addis Ababa")
  .max(ADDIS_BOUNDS.maxLat, "Latitude is outside Addis Ababa");
const lon = z
  .number()
  .min(ADDIS_BOUNDS.minLon, "Longitude is outside Addis Ababa")
  .max(ADDIS_BOUNDS.maxLon, "Longitude is outside Addis Ababa");

export const stopRenameSchema = z.object({
  stopId: z.string().min(1),
  /** Null clears the override, restoring the feed's name. */
  name: z.string().trim().min(1).max(255).nullable(),
});

export const stopCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  lat,
  lon,
  /** Optional: insert into this route's trips at this position. */
  routeId: z.string().min(1).optional(),
  directionId: z.number().int().min(0).max(1).optional(),
  sequence: z.number().int().min(1).optional(),
});

export const stopIdSchema = z.object({ stopId: z.string().min(1) });

export type StopRenameInput = z.input<typeof stopRenameSchema>;
export type StopCreateInput = z.input<typeof stopCreateSchema>;

export { ADDIS_BOUNDS };
