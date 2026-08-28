"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { applyFareChange, type FareData } from "@/lib/fare-write";
import { prisma } from "@/lib/prisma";
import { denyOutOfScope } from "@/lib/operator-scope";
import { requirePermission } from "@/lib/session";
import { fareSchema, tierSchema, type FareInput } from "./fare-schema";

function toFareData(
  input: Extract<FareInput, { kind: FareInput["kind"] }>,
): FareData {
  return input.kind === "FLAT"
    ? { kind: "FLAT", flatAmountEtb: input.flatAmountEtb }
    : { kind: "TIERED", tiers: input.tiers };
}

export async function updateFare(input: FareInput) {
  const session = await requirePermission({ fare: ["update"] });
  const data = fareSchema.parse(input);

  const denied = await denyOutOfScope(session.user.id, {
    routeId: data.routeId,
  });
  if (denied) return denied;

  await prisma.$transaction((tx) =>
    applyFareChange(tx, data.routeId, toFareData(data), {
      source: "CONSOLE_EDIT",
      changedById: session.user.id,
    }),
  );

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
  const session = await requirePermission({ fare: ["update"] });
  const data = bulkFareSchema.parse(input);

  // Checked as a set: a bulk write that silently dropped the routes the
  // operator does not own would report a count they cannot reconcile.
  const denied = await denyOutOfScope(session.user.id, {
    routeIds: data.routeIds,
  });
  if (denied) return denied;
  const fareData: FareData =
    data.kind === "FLAT"
      ? { kind: "FLAT", flatAmountEtb: data.flatAmountEtb }
      : { kind: "TIERED", tiers: data.tiers };

  await prisma.$transaction(async (tx) => {
    for (const routeId of data.routeIds) {
      await applyFareChange(tx, routeId, fareData, {
        source: "CONSOLE_EDIT",
        changedById: session.user.id,
      });
    }
  });

  revalidatePath("/console");
  revalidatePath("/console/fares");
  return { ok: true as const, count: data.routeIds.length };
}
