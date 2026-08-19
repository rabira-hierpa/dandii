import { z } from "zod";

/**
 * A per-trip correction. Both fields are optional-and-nullable: absent leaves
 * the override alone, explicit null clears it so the feed value returns.
 */
export const tripEditSchema = z.object({
  tripId: z.string().min(1),
  /** GTFS block_id — groups trips a single vehicle runs back to back. */
  blockId: z.string().trim().max(64).nullish(),
  headsign: z.string().trim().max(255).nullish(),
});

export type TripEditInput = z.input<typeof tripEditSchema>;
