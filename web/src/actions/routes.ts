"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createRouteRow } from "@/lib/route-create";
import { denyOutOfScope, getUserOperatorCode } from "@/lib/operator-scope";
import { requirePermission } from "@/lib/session";

const routeFieldsSchema = z.object({
  shortName: z.string().trim().min(1, "Route id is required"),
  longName: z.string().trim().min(1, "Corridor is required"),
  type: z.union([z.literal(0), z.literal(3)]),
  lengthKm: z.number().min(0).nullable(),
  operatorId: z.string().min(1).nullable(),
});

const updateRouteSchema = routeFieldsSchema.extend({
  routeId: z.string().min(1),
});

const bulkAssignSchema = z.object({
  routeIds: z.array(z.string().min(1)).min(1),
  operatorId: z.string().min(1),
});

const deleteRoutesSchema = z.object({
  routeIds: z.array(z.string().min(1)).min(1),
});

function revalidateConsole() {
  revalidatePath("/console");
  revalidatePath("/console/routes");
  revalidatePath("/console/fares");
  revalidatePath("/console/network");
  revalidatePath("/console/analytics");
}

export async function createRoute(input: z.infer<typeof routeFieldsSchema>) {
  const session = await requirePermission({ route: ["create"] });
  const data = routeFieldsSchema.parse(input);

  // Shared with the network-map editor's createRoute. The permissions differ by
  // design; the row invariants must not (see lib/route-create.ts).
  const created = await createRouteRow({
    shortName: data.shortName,
    longName: data.longName,
    type: data.type,
    lengthMeters: data.lengthKm != null ? data.lengthKm * 1000 : null,
    operatorId: data.operatorId,
    assignedById: session.user.id,
  });
  if (!created.ok) return { ok: false as const, error: created.error };

  revalidateConsole();
  return { ok: true as const, routeId: created.routeId };
}

export async function updateRoute(input: z.infer<typeof updateRouteSchema>) {
  const session = await requirePermission({ route: ["update"] });
  const data = updateRouteSchema.parse(input);

  const denied = await denyOutOfScope(session.user.id, {
    routeId: data.routeId,
  });
  if (denied) return denied;

  // Handing a route to a different operator is an admin act. A scoped user
  // may edit their own routes freely, but moving one across the boundary —
  // in either direction — is the boundary itself, so it isn't theirs to move.
  const scope = await getUserOperatorCode(session.user.id);
  if (scope !== null) {
    const current = await prisma.routeAssignment.findUnique({
      where: { routeId: data.routeId },
      select: { operatorId: true },
    });
    if ((data.operatorId ?? null) !== (current?.operatorId ?? null)) {
      return {
        ok: false as const,
        error: "Only an admin can reassign a route to another operator",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.route.update({
      where: { id: data.routeId },
      data: {
        shortName: data.shortName,
        longName: data.longName,
        type: data.type,
        lengthMeters: data.lengthKm != null ? data.lengthKm * 1000 : null,
      },
    });
    if (data.operatorId) {
      await tx.routeAssignment.upsert({
        where: { routeId: data.routeId },
        create: {
          routeId: data.routeId,
          operatorId: data.operatorId,
          assignedById: session.user.id,
        },
        update: {
          operatorId: data.operatorId,
          assignedById: session.user.id,
          assignedAt: new Date(),
        },
      });
    } else {
      await tx.routeAssignment.deleteMany({ where: { routeId: data.routeId } });
    }
  });

  revalidateConsole();
  return { ok: true as const };
}

export async function bulkAssignRoutes(input: z.infer<typeof bulkAssignSchema>) {
  const session = await requirePermission({ route: ["assign"] });
  const { routeIds, operatorId } = bulkAssignSchema.parse(input);

  // Bulk assignment is how routes change hands, so it stays with the roles
  // that have no operator of their own to favour.
  if ((await getUserOperatorCode(session.user.id)) !== null) {
    return {
      ok: false as const,
      error: "Only an admin can reassign routes between operators",
    };
  }

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
  });
  if (!operator) return { ok: false as const, error: "Unknown operator" };

  await prisma.$transaction(
    routeIds.map((routeId) =>
      prisma.routeAssignment.upsert({
        where: { routeId },
        create: { routeId, operatorId, assignedById: session.user.id },
        update: {
          operatorId,
          assignedById: session.user.id,
          assignedAt: new Date(),
        },
      }),
    ),
  );

  revalidateConsole();
  return {
    ok: true as const,
    count: routeIds.length,
    operatorName: operator.name,
  };
}

export async function deleteRoutes(input: z.infer<typeof deleteRoutesSchema>) {
  await requirePermission({ route: ["delete"] });
  const { routeIds } = deleteRoutesSchema.parse(input);

  // Trips, stop times, fares, closures, and assignments cascade.
  const result = await prisma.route.deleteMany({
    where: { id: { in: routeIds } },
  });

  revalidateConsole();
  return { ok: true as const, count: result.count };
}
