"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
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

  const agency = await prisma.agency.findFirst({ select: { id: true } });
  if (!agency) return { ok: false as const, error: "No agency configured" };

  const route = await prisma.route.create({
    data: {
      id: `manual-${randomUUID()}`,
      shortName: data.shortName,
      longName: data.longName,
      type: data.type,
      lengthMeters: data.lengthKm != null ? data.lengthKm * 1000 : null,
      agencyId: agency.id,
      ...(data.operatorId
        ? {
            assignment: {
              create: {
                operatorId: data.operatorId,
                assignedById: session.user.id,
              },
            },
          }
        : {}),
    },
  });

  revalidateConsole();
  return { ok: true as const, routeId: route.id };
}

export async function updateRoute(input: z.infer<typeof updateRouteSchema>) {
  const session = await requirePermission({ route: ["update"] });
  const data = updateRouteSchema.parse(input);

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
