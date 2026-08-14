"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import {
  stopCreateSchema,
  stopIdSchema,
  stopRenameSchema,
  stopReorderSchema,
  type StopCreateInput,
  type StopRenameInput,
  type StopReorderInput,
} from "./stop-edit-schema";

function revalidateConsole() {
  revalidatePath("/console");
  revalidatePath("/console/network");
  revalidatePath("/api/geo/routes");
}

function zodError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof ZodError) {
    return { ok: false, error: err.issues[0]?.message ?? fallback };
  }
  throw err;
}

/**
 * Rename a stop.
 *
 * This is the answer to the feed's near-duplicate names — 45 stops called some
 * variant of "Megenagna" — so operators can disambiguate ("Megenagna LRT",
 * "Megenagna Taxi") without touching geometry.
 */
export async function renameStop(input: StopRenameInput) {
  const session = await requirePermission({ feedEdit: ["rename"] });

  let data;
  try {
    data = stopRenameSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid stop name");
  }

  const stop = await prisma.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, origin: true },
  });
  if (!stop) return { ok: false as const, error: "Stop not found" };

  if (stop.origin === "OPERATOR") {
    // No base feed row to fall back to — the Stop row is the truth.
    if (data.name === null) {
      return { ok: false as const, error: "This stop needs a name" };
    }
    await prisma.stop.update({
      where: { id: stop.id },
      data: { name: data.name },
    });
  } else {
    await prisma.stopOverride.upsert({
      where: { stopId: stop.id },
      create: {
        stopId: stop.id,
        name: data.name,
        editedById: session.user.id,
      },
      update: { name: data.name, editedById: session.user.id },
    });
    // Mirror so search and the map show the corrected name immediately; on a
    // reseed the override replays it. A null name restores the feed's value,
    // which only the next reseed can actually recover, so leave the row alone.
    if (data.name !== null) {
      await prisma.stop.update({
        where: { id: stop.id },
        data: { name: data.name },
      });
    }
  }

  revalidateConsole();
  return { ok: true as const };
}

/**
 * Create a stop the feed doesn't have, optionally splicing it into a route's
 * trips at a given position.
 */
export async function createStop(input: StopCreateInput) {
  await requirePermission({ feedEdit: ["rename"] });

  let data;
  try {
    data = stopCreateSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid stop");
  }

  const id = `op:${crypto.randomUUID()}`;
  await prisma.stop.create({
    data: {
      id,
      name: data.name,
      lat: data.lat,
      lon: data.lon,
      origin: "OPERATOR",
    },
  });

  if (data.routeId && data.sequence !== undefined) {
    const inserted = await insertStopIntoRoute(
      id,
      data.routeId,
      data.directionId,
      data.sequence,
    );
    if (!inserted) {
      // Leave the stop in place — it exists and is usable elsewhere — but say
      // plainly that it isn't on the route, rather than implying it is.
      revalidateConsole();
      return {
        ok: true as const,
        data: { stopId: id, addedToRoute: false },
      };
    }
  }

  revalidateConsole();
  return { ok: true as const, data: { stopId: id, addedToRoute: true } };
}

/**
 * Splice a stop into every trip of a route (optionally one direction) at
 * `sequence`, shifting later stops down.
 *
 * Times are left null on the new stop_time: interpolating an arrival from the
 * neighbours would invent a schedule nobody measured. Recomputing them properly
 * belongs with the stop-sequence editor (T4), which has the distance data.
 */
async function insertStopIntoRoute(
  stopId: string,
  routeId: string,
  directionId: number | undefined,
  sequence: number,
): Promise<boolean> {
  const trips = await prisma.trip.findMany({
    where: {
      routeId,
      ...(directionId !== undefined ? { directionId } : {}),
    },
    select: { id: true },
  });
  if (trips.length === 0) return false;

  for (const trip of trips) {
    await prisma.$transaction(async (tx) => {
      // Shift downward from the end so the composite (tripId, sequence) primary
      // key never collides mid-shift.
      const later = await tx.stopTime.findMany({
        where: { tripId: trip.id, sequence: { gte: sequence } },
        orderBy: { sequence: "desc" },
        select: { tripId: true, sequence: true },
      });
      for (const row of later) {
        await tx.stopTime.update({
          where: {
            tripId_sequence: { tripId: row.tripId, sequence: row.sequence },
          },
          data: { sequence: row.sequence + 1 },
        });
      }
      await tx.stopTime.create({
        data: { tripId: trip.id, stopId, sequence },
      });
    });
  }
  return true;
}

/**
 * Delete a stop.
 *
 * Refuses when other routes still serve it. Deleting a stop cascades its
 * stop_times, which would silently shorten every route that calls there — a
 * change the operator never asked for and would not see. Busy interchanges are
 * exactly where this bites: the worst stop in the feed serves 26 routes.
 */
export async function deleteStop(input: { stopId: string }) {
  const session = await requirePermission({ feedEdit: ["rename"] });

  let data;
  try {
    data = stopIdSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid stop");
  }

  const stop = await prisma.stop.findUnique({
    where: { id: data.stopId },
    select: { id: true, name: true, origin: true },
  });
  if (!stop) return { ok: false as const, error: "Stop not found" };

  const routes = await prisma.stopTime.findMany({
    where: { stopId: stop.id },
    select: { trip: { select: { routeId: true } } },
  });
  const routeIds = new Set(routes.map((r) => r.trip.routeId));
  if (routeIds.size > 1) {
    return {
      ok: false as const,
      error: `${stop.name} is served by ${routeIds.size} routes — remove it from those routes first`,
    };
  }

  if (stop.origin === "OPERATOR") {
    await prisma.stopOverride.deleteMany({ where: { stopId: stop.id } });
    await prisma.stop.delete({ where: { id: stop.id } });
  } else {
    await prisma.stopOverride.upsert({
      where: { stopId: stop.id },
      create: {
        stopId: stop.id,
        deletedAt: new Date(),
        editedById: session.user.id,
      },
      update: { deletedAt: new Date(), editedById: session.user.id },
    });
    await prisma.stop.delete({ where: { id: stop.id } });
  }

  revalidateConsole();
  return { ok: true as const };
}

/**
 * Reorder a direction's stops.
 *
 * Two things worth knowing about how this is applied.
 *
 * **Times stay with the position, not the stop.** A run reaches its fifth call
 * at 06:20 whichever stop that is. Carrying each stop's old time along with it
 * would produce a timetable that goes backwards in the middle, which is invalid
 * GTFS and would break every arrival estimate downstream.
 *
 * **Rows are cleared before being rewritten.** stop_time's primary key is
 * (tripId, sequence), so updating positions in place collides the moment two
 * stops swap. Deleting the direction's rows and re-inserting in the new order
 * sidesteps the whole class of ordering bugs, inside a transaction so a failure
 * can't leave a trip half-sequenced.
 */
export async function reorderRouteStops(input: StopReorderInput) {
  const session = await requirePermission({ feedEdit: ["shape"] });

  let data;
  try {
    data = stopReorderSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid stop order");
  }

  if (new Set(data.stopIds).size !== data.stopIds.length) {
    return { ok: false as const, error: "The same stop appears twice" };
  }

  const trips = await prisma.trip.findMany({
    where: { routeId: data.routeId, directionId: data.directionId },
    select: {
      id: true,
      stopTimes: {
        orderBy: { sequence: "asc" },
        select: { stopId: true, arrival: true, departure: true },
      },
    },
  });
  if (trips.length === 0) {
    return { ok: false as const, error: "This direction has no trips" };
  }

  // Reject an order that isn't a permutation of what the trip actually serves —
  // a stale client would otherwise silently drop or invent calls.
  const expected = new Set(trips[0].stopTimes.map((st) => st.stopId));
  if (
    expected.size !== data.stopIds.length ||
    data.stopIds.some((id) => !expected.has(id))
  ) {
    return {
      ok: false as const,
      error: "Stop list is out of date — reopen the route and try again",
    };
  }

  for (const trip of trips) {
    const times = trip.stopTimes.map((st) => ({
      arrival: st.arrival,
      departure: st.departure,
    }));
    await prisma.$transaction(async (tx) => {
      await tx.stopTime.deleteMany({ where: { tripId: trip.id } });
      await tx.stopTime.createMany({
        data: data.stopIds.map((stopId, i) => ({
          tripId: trip.id,
          stopId,
          sequence: i + 1,
          arrival: times[i]?.arrival ?? null,
          departure: times[i]?.departure ?? null,
        })),
      });
    });
  }

  await prisma.routeStopOrderOverride.upsert({
    where: {
      routeId_directionId: {
        routeId: data.routeId,
        directionId: data.directionId,
      },
    },
    create: { ...data, editedById: session.user.id },
    update: { stopIds: data.stopIds, editedById: session.user.id },
  });

  revalidateConsole();
  return { ok: true as const };
}
