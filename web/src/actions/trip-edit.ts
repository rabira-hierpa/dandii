"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { tripEditSchema, type TripEditInput } from "./trip-edit-schema";

/**
 * Edit a trip's block id or headsign.
 *
 * block_id is not a column the DT4A feed has, so this is operator knowledge
 * rather than a correction — which is exactly why it needs storing: nothing
 * would reconstruct it after a reseed.
 */
export async function updateTripFields(input: TripEditInput) {
  const session = await requirePermission({ feedEdit: ["edit"] });

  let data;
  try {
    data = tripEditSchema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false as const, error: err.issues[0]?.message ?? "Invalid trip" };
    }
    throw err;
  }

  const trip = await prisma.trip.findUnique({
    where: { id: data.tripId },
    select: { id: true },
  });
  if (!trip) return { ok: false as const, error: "Trip not found" };

  const fields = { blockId: data.blockId, headsign: data.headsign };
  await prisma.tripOverride.upsert({
    where: { tripId: data.tripId },
    create: { tripId: data.tripId, editedById: session.user.id, ...fields },
    update: { editedById: session.user.id, ...fields },
  });

  // headsign has a Trip column and doubles as the direction label, so mirror it.
  // blockId has none — it reaches riders only through the regenerated feed.
  if (data.headsign !== undefined && data.headsign !== null) {
    await prisma.trip.update({
      where: { id: data.tripId },
      data: { headsign: data.headsign },
    });
  }

  revalidatePath("/console/network");
  return { ok: true as const };
}
