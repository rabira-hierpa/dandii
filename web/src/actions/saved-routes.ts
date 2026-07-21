"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const routeIdSchema = z.object({ routeId: z.string().min(1) });

export async function toggleSavedRoute(input: z.infer<typeof routeIdSchema>) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Sign in to save routes" };
  const { routeId } = routeIdSchema.parse(input);

  const existing = await prisma.savedRoute.findUnique({
    where: { userId_routeId: { userId: session.user.id, routeId } },
  });
  if (existing) {
    await prisma.savedRoute.delete({
      where: { userId_routeId: { userId: session.user.id, routeId } },
    });
    return { ok: true as const, saved: false };
  }
  // Ignore unknown-route FK errors as a plain "not saved".
  const route = await prisma.route.findUnique({ where: { id: routeId } });
  if (!route) return { ok: false as const, error: "Unknown route" };
  await prisma.savedRoute.create({
    data: { userId: session.user.id, routeId },
  });
  return { ok: true as const, saved: true };
}

/** Marks the user's submissions as seen — clears the unseen-count badge (D2). */
export async function markSubmissionsViewed() {
  const session = await getSession();
  if (!session) return { ok: false as const };
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSubmissionsViewedAt: new Date() },
  });
  return { ok: true as const };
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

export async function updateProfile(input: z.infer<typeof profileSchema>) {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not signed in" };
  const { name } = profileSchema.parse(input);
  await prisma.user.update({ where: { id: session.user.id }, data: { name } });
  return { ok: true as const };
}
