"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { MAINTAINER_REASONS } from "@/lib/operators";
import { prisma } from "@/lib/prisma";
import { denyOutOfScope } from "@/lib/operator-scope";
import { requirePermission } from "@/lib/session";
import { invalidateClosureCache } from "@/lib/transit";
import { closureSchema, type ClosureInput } from "./closure-schema";

function revalidateConsole() {
  // Closures are cached for a few seconds on the directions hot path; a write
  // has to drop that read or the operator watches their own change not happen.
  invalidateClosureCache();
  revalidatePath("/console");
  revalidatePath("/console/routes");
  revalidatePath("/console/network");
  revalidatePath("/api/geo/routes");
}

/**
 * Ordered stop ids for one trip on the route (canonical outbound = lowest
 * trip id). Used to validate and normalize a closed range.
 */
async function routeStopOrder(routeId: string): Promise<string[]> {
  const trip = await prisma.trip.findFirst({
    where: { routeId },
    orderBy: { id: "asc" },
    select: {
      stopTimes: {
        orderBy: { sequence: "asc" },
        select: { stopId: true },
      },
    },
  });
  return trip?.stopTimes.map((st) => st.stopId) ?? [];
}

export async function createClosure(input: ClosureInput) {
  const session = await requirePermission({ closure: ["create"] });

  let data;
  try {
    data = closureSchema.parse(input);
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false as const,
        error: err.issues[0]?.message ?? "Invalid closure",
      };
    }
    throw err;
  }

  const role = session.user.role ?? "user";
  if (role === "maintainer" && !MAINTAINER_REASONS.includes(data.reason)) {
    return {
      ok: false as const,
      error: "Maintainers can only create maintenance or other closures",
    };
  }

  // Before the kind branch, deliberately: WHOLE_ROUTE takes the entire line
  // off the map, so it is the last kind that should skip a scope check.
  const denied = await denyOutOfScope(session.user.id, {
    routeId: data.routeId,
  });
  if (denied) return denied;

  let fromStopId: string | null = null;
  let toStopId: string | null = null;

  if (data.kind !== "WHOLE_ROUTE") {
    const order = await routeStopOrder(data.routeId);
    if (order.length === 0) {
      return { ok: false as const, error: "Route has no trips/stops to close" };
    }
    const from = data.fromStopId!;
    const to = data.toStopId!;
    const i = order.indexOf(from);
    const j = order.indexOf(to);
    if (i < 0 || j < 0) {
      return {
        ok: false as const,
        error: "Both stops must be on this route",
      };
    }
    // Normalize so from precedes to in trip order.
    fromStopId = i <= j ? from : to;
    toStopId = i <= j ? to : from;
  }

  await prisma.routeClosure.create({
    data: {
      routeId: data.routeId,
      reason: data.reason,
      note: data.note || null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      createdById: session.user.id,
      kind: data.kind,
      fromStopId,
      toStopId,
    },
  });

  revalidateConsole();
  return { ok: true as const };
}

/** Ends an active closure now (reopens the route). */
export async function endClosure(closureId: string) {
  const session = await requirePermission({ closure: ["update"] });

  const closure = await prisma.routeClosure.findUnique({
    where: { id: closureId },
  });
  if (!closure) return { ok: false as const, error: "Closure not found" };

  // Scope resolves through the closure's own route: the caller supplies only
  // a closure id, so the route has to be read before it can be checked.
  const denied = await denyOutOfScope(session.user.id, {
    routeId: closure.routeId,
  });
  if (denied) return denied;

  await prisma.routeClosure.update({
    where: { id: closureId },
    data: { endsAt: new Date() },
  });

  revalidateConsole();
  return { ok: true as const };
}
