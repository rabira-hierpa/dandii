"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { createRouteRow, operatorId } from "@/lib/route-create";
import { requirePermission } from "@/lib/session";
import {
  routeCreateSchema,
  routeEditSchema,
  routeIdSchema,
  type RouteCreateInput,
  type RouteEditInput,
} from "./route-edit-schema";

function revalidateConsole() {
  revalidatePath("/console");
  revalidatePath("/console/routes");
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
 * Edit a route's GTFS fields.
 *
 * Writes a RouteOverride rather than touching the Route row, so a reseed can
 * replay the edit instead of losing it. Fields the caller omits are left alone;
 * fields set to null clear the override so the base feed value comes back.
 */
export async function updateRouteFields(input: RouteEditInput) {
  const session = await requirePermission({ feedEdit: ["edit"] });

  let data;
  try {
    data = routeEditSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid route edit");
  }

  const route = await prisma.route.findUnique({
    where: { id: data.routeId },
    select: { id: true },
  });
  if (!route) return { ok: false as const, error: "Route not found" };

  // `undefined` tells Prisma "don't touch"; explicit null clears the override.
  const fields = {
    shortName: data.shortName,
    longName: data.longName,
    desc: data.desc,
    url: data.url,
    type: data.type,
    color: data.color,
    textColor: data.textColor,
    operatorCode: data.operatorCode,
    continuousPickup: data.continuousPickup,
    continuousDropOff: data.continuousDropOff,
  };

  await prisma.routeOverride.upsert({
    where: { routeId: data.routeId },
    create: { routeId: data.routeId, editedById: session.user.id, ...fields },
    update: { editedById: session.user.id, ...fields },
  });

  // Mirror onto the Route row so map/search/directions reflect the edit before
  // the next publish. desc/url/continuous_* have no Route column — they are
  // export-only and reach riders when the feed is regenerated.
  const mirrored = {
    ...(data.shortName != null ? { shortName: data.shortName } : {}),
    ...(data.longName != null ? { longName: data.longName } : {}),
    ...(data.type != null ? { type: data.type } : {}),
    ...(data.color !== undefined ? { color: data.color } : {}),
    ...(data.textColor !== undefined ? { textColor: data.textColor } : {}),
  };
  if (Object.keys(mirrored).length > 0) {
    await prisma.route.update({ where: { id: data.routeId }, data: mirrored });
  }

  if (data.operatorCode) {
    const operator = await prisma.operator.findUnique({
      where: { code: data.operatorCode },
      select: { id: true },
    });
    if (operator) {
      await prisma.routeAssignment.upsert({
        where: { routeId: data.routeId },
        create: { routeId: data.routeId, operatorId: operator.id },
        update: { operatorId: operator.id },
      });
    }
  }

  revalidateConsole();
  return { ok: true as const };
}

/** Create a route that isn't in the feed. Origin OPERATOR so reseed keeps it. */
export async function createRoute(input: RouteCreateInput) {
  const session = await requirePermission({ feedEdit: ["edit"] });

  let data;
  try {
    data = routeCreateSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid route");
  }

  const operator = await prisma.operator.findUnique({
    where: { code: data.operatorCode },
    select: { id: true },
  });
  if (!operator) return { ok: false as const, error: "Unknown operator" };

  // Shared with the console routes table's createRoute. The permissions differ
  // by design; the row invariants must not (see lib/route-create.ts).
  const created = await createRouteRow({
    shortName: data.shortName,
    longName: data.longName,
    type: data.type,
    color: data.color ?? null,
    textColor: data.textColor ?? null,
    operatorId: operator.id,
  });
  if (!created.ok) return { ok: false as const, error: created.error };

  if (data.desc) {
    await prisma.routeOverride.create({
      data: {
        routeId: created.routeId,
        desc: data.desc,
        editedById: session.user.id,
      },
    });
  }

  revalidateConsole();
  return { ok: true as const, data: { routeId: created.routeId } };
}

/**
 * Copy a route's metadata into a new operator-owned route.
 *
 * Metadata only — trips, stop_times and shapes are NOT copied. A duplicate is
 * for "same corridor, different service pattern", and silently cloning 9,000
 * stop_times would make the duplicate look complete when it has never been
 * checked by anyone.
 */
export async function duplicateRoute(input: { routeId: string }) {
  const session = await requirePermission({ feedEdit: ["edit"] });

  let data;
  try {
    data = routeIdSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid route");
  }

  const source = await prisma.route.findUnique({
    where: { id: data.routeId },
    select: {
      shortName: true,
      longName: true,
      type: true,
      color: true,
      textColor: true,
      agencyId: true,
      assignment: { select: { operatorId: true } },
    },
  });
  if (!source) return { ok: false as const, error: "Route not found" };

  const id = operatorId();
  await prisma.route.create({
    data: {
      id,
      shortName: `${source.shortName} (copy)`,
      longName: source.longName,
      type: source.type,
      color: source.color,
      textColor: source.textColor,
      agencyId: source.agencyId,
      origin: "OPERATOR",
      ...(source.assignment
        ? { assignment: { create: { operatorId: source.assignment.operatorId } } }
        : {}),
    },
  });
  void session;

  revalidateConsole();
  return { ok: true as const, data: { routeId: id } };
}

/**
 * Delete a route.
 *
 * An operator-created route is really deleted — nothing would bring it back.
 * A feed route gets a tombstone instead: deleting the row outright is a lie the
 * next reseed undoes, so the deletion is recorded and re-applied after reload.
 */
export async function deleteRoute(input: { routeId: string }) {
  const session = await requirePermission({ feedEdit: ["edit"] });

  let data;
  try {
    data = routeIdSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid route");
  }

  const route = await prisma.route.findUnique({
    where: { id: data.routeId },
    select: { id: true, origin: true },
  });
  if (!route) return { ok: false as const, error: "Route not found" };

  if (route.origin === "OPERATOR") {
    await prisma.routeOverride.deleteMany({ where: { routeId: route.id } });
    await prisma.route.delete({ where: { id: route.id } });
  } else {
    await prisma.routeOverride.upsert({
      where: { routeId: route.id },
      create: {
        routeId: route.id,
        deletedAt: new Date(),
        editedById: session.user.id,
      },
      update: { deletedAt: new Date(), editedById: session.user.id },
    });
    await prisma.route.delete({ where: { id: route.id } });
  }

  revalidateConsole();
  return { ok: true as const };
}
