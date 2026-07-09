"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { fareSchema, tierSchema, type FareInput } from "./fare-schema";

export async function updateFare(input: FareInput) {
  await requirePermission({ fare: ["update"] });
  const data = fareSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const fare = await tx.fare.upsert({
      where: { routeId: data.routeId },
      create: {
        routeId: data.routeId,
        kind: data.kind,
        flatAmountEtb: data.kind === "FLAT" ? data.flatAmountEtb : null,
      },
      update: {
        kind: data.kind,
        flatAmountEtb: data.kind === "FLAT" ? data.flatAmountEtb : null,
      },
    });
    await tx.fareTier.deleteMany({ where: { fareId: fare.id } });
    if (data.kind === "TIERED") {
      await tx.fareTier.createMany({
        data: data.tiers.map((t) => ({
          fareId: fare.id,
          label: t.label,
          fromKm: t.fromKm,
          toKm: t.toKm,
          amountEtb: t.amountEtb,
        })),
      });
    }
  });

  revalidatePath("/console");
  revalidatePath("/console/fares");
  return { ok: true as const };
}

const bulkFareSchema = z.discriminatedUnion("kind", [
  z.object({
    routeIds: z.array(z.string().min(1)).min(1),
    kind: z.literal("FLAT"),
    flatAmountEtb: z.number().min(0),
  }),
  z.object({
    routeIds: z.array(z.string().min(1)).min(1),
    kind: z.literal("TIERED"),
    tiers: z.array(tierSchema).min(1),
  }),
]);

/** Applies one fare structure to every selected route. */
export async function bulkSetFare(input: z.infer<typeof bulkFareSchema>) {
  await requirePermission({ fare: ["update"] });
  const data = bulkFareSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    for (const routeId of data.routeIds) {
      const fare = await tx.fare.upsert({
        where: { routeId },
        create: {
          routeId,
          kind: data.kind,
          flatAmountEtb: data.kind === "FLAT" ? data.flatAmountEtb : null,
        },
        update: {
          kind: data.kind,
          flatAmountEtb: data.kind === "FLAT" ? data.flatAmountEtb : null,
        },
      });
      await tx.fareTier.deleteMany({ where: { fareId: fare.id } });
      if (data.kind === "TIERED") {
        await tx.fareTier.createMany({
          data: data.tiers.map((t) => ({
            fareId: fare.id,
            label: t.label,
            fromKm: t.fromKm,
            toKm: t.toKm,
            amountEtb: t.amountEtb,
          })),
        });
      }
    }
  });

  revalidatePath("/console");
  revalidatePath("/console/fares");
  return { ok: true as const, count: data.routeIds.length };
}
