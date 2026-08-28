"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OPERATOR_CODES } from "@/lib/operators";
import {
  APP_ROLES,
  ASSIGNABLE_ROLES,
  OPERATOR_SCOPED_ROLES,
  type AppRole,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

const setMemberRoleSchema = z
  .object({
    userId: z.string().min(1),
    role: z.enum(APP_ROLES),
    operatorCode: z.enum(OPERATOR_CODES).nullish(),
  })
  .superRefine((value, ctx) => {
    const needsOperator = OPERATOR_SCOPED_ROLES.includes(value.role);
    if (needsOperator && !value.operatorCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operatorCode"],
        message: "A route operator needs an operator",
      });
    }
    if (!needsOperator && value.operatorCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operatorCode"],
        message: `A ${value.role} works across every operator`,
      });
    }
  });

export type SetMemberRoleInput = z.input<typeof setMemberRoleSchema>;

/**
 * Change a member's role and operator scope together.
 *
 * This exists instead of better-auth's `admin.setRole` because that call
 * knows nothing about `operatorCode`: demoting an admin to route-operator
 * through it would leave the scope null, and a route-operator with no
 * operator is one that can edit every operator's routes. Role and scope are
 * one decision, so they are one write.
 */
export async function setMemberRole(input: SetMemberRoleInput) {
  const session = await requirePermission({ user: ["set-role"] });

  const parsed = setMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid role change",
    };
  }
  const data = parsed.data;

  if (data.userId === session.user.id) {
    return { ok: false as const, error: "You cannot change your own role" };
  }

  const currentRole = (session.user.role ?? "user") as AppRole;
  const assignable = ASSIGNABLE_ROLES[currentRole] ?? [];
  if (!assignable.includes(data.role)) {
    return { ok: false as const, error: `You cannot grant the ${data.role} role` };
  }

  const target = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { role: true },
  });
  if (!target) return { ok: false as const, error: "Member not found" };

  // Changing someone requires the power to grant what they already hold —
  // otherwise an admin could demote a super-admin and then re-grant freely.
  if (!assignable.includes((target.role ?? "user") as AppRole)) {
    return { ok: false as const, error: "You cannot change this member's role" };
  }

  await prisma.user.update({
    where: { id: data.userId },
    data: { role: data.role, operatorCode: data.operatorCode ?? null },
  });

  revalidatePath("/settings/members");
  return { ok: true as const };
}
