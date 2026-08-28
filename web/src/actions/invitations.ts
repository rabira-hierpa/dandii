"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { sendEmail } from "@/lib/email";
import { OPERATOR_META } from "@/lib/operators";
import { prisma } from "@/lib/prisma";
import { ASSIGNABLE_ROLES, type AppRole } from "@/lib/permissions";
import { getSession, requirePermission } from "@/lib/session";
import {
  invitationCreateSchema,
  invitationTokenSchema,
  type InvitationCreateInput,
  type InvitationTokenInput,
} from "./invitation-schema";

const INVITE_TTL_DAYS = 7;

function zodError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof ZodError) {
    return { ok: false, error: err.issues[0]?.message ?? fallback };
  }
  throw err;
}

function siteOrigin() {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

function inviteLink(token: string) {
  return `${siteOrigin()}/invite/${token}`;
}

/**
 * Invite someone to the console with a specific role.
 *
 * The role is checked against `ASSIGNABLE_ROLES[currentRole]` — the same
 * power an admin has when changing a member's role in Settings — so an admin
 * can't invite a super-admin by going through this action instead of
 * `setRole`. A prior pending invitation to the same email is superseded
 * rather than left to collide on accept.
 */
export async function createInvitation(input: InvitationCreateInput) {
  const session = await requirePermission({ invitation: ["create"] });

  let data;
  try {
    data = invitationCreateSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid invitation");
  }

  const currentRole = (session.user.role ?? "user") as AppRole;
  const assignable = ASSIGNABLE_ROLES[currentRole] ?? [];
  if (!assignable.includes(data.role)) {
    return {
      ok: false as const,
      error: `You cannot invite someone as ${data.role}`,
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, role: true, operatorCode: true },
  });
  const scope = data.operatorCode ?? null;
  if (
    existingUser &&
    existingUser.role === data.role &&
    existingUser.operatorCode === scope
  ) {
    return {
      ok: false as const,
      error: scope
        ? `${data.email} already operates ${OPERATOR_META[scope].name}`
        : `${data.email} already has the ${data.role} role`,
    };
  }

  // Superseding a stale pending invite avoids two live tokens for the same
  // email racing each other on accept.
  await prisma.invitation.updateMany({
    where: { email: data.email, status: "PENDING" },
    data: { status: "EXPIRED" },
  });

  const token = randomUUID();
  const invitation = await prisma.invitation.create({
    data: {
      email: data.email,
      role: data.role,
      operatorCode: scope,
      token,
      invitedById: session.user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const asWhat = scope
    ? `${data.role} for ${OPERATOR_META[scope].name}`
    : data.role;
  const link = inviteLink(token);
  const { sent } = await sendEmail({
    to: data.email,
    subject: "You're invited to the Dandii console",
    text: `${session.user.name} invited you to join the Dandii operations console as ${asWhat}.\n\nAccept: ${link}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    html: `<p>${session.user.name} invited you to join the Dandii operations console as <strong>${asWhat}</strong>.</p><p><a href="${link}">Accept the invitation</a></p><p>This link expires in ${INVITE_TTL_DAYS} days.</p>`,
  });

  revalidatePath("/settings/invitations");
  return {
    ok: true as const,
    data: { id: invitation.id, link, emailed: sent },
  };
}

/** Revoke a pending invitation. Same role-power check as creating one. */
export async function revokeInvitation(input: { invitationId: string }) {
  const session = await requirePermission({ invitation: ["revoke"] });

  const invitation = await prisma.invitation.findUnique({
    where: { id: input.invitationId },
  });
  if (!invitation) return { ok: false as const, error: "Invitation not found" };

  const currentRole = (session.user.role ?? "user") as AppRole;
  const assignable = ASSIGNABLE_ROLES[currentRole] ?? [];
  if (!assignable.includes(invitation.role as AppRole)) {
    return { ok: false as const, error: "You cannot revoke this invitation" };
  }
  if (invitation.status !== "PENDING") {
    return { ok: false as const, error: "This invitation is no longer pending" };
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
  });

  revalidatePath("/settings/invitations");
  return { ok: true as const };
}

/**
 * Accept an invitation for the currently signed-in user.
 *
 * Self-service by design — no `requirePermission` here, since acceptance is
 * what *grants* the permission. The only gate is that the signed-in email
 * must match the invited one, so a signed-in user can't accept an invitation
 * meant for someone else's inbox.
 */
export async function acceptInvitation(input: InvitationTokenInput) {
  let data;
  try {
    data = invitationTokenSchema.parse(input);
  } catch (err) {
    return zodError(err, "Invalid invitation link");
  }

  const session = await getSession();
  if (!session) {
    return { ok: false as const, error: "SIGN_IN_REQUIRED" as const };
  }

  const invitation = await prisma.invitation.findUnique({
    where: { token: data.token },
  });
  if (!invitation) {
    return { ok: false as const, error: "This invitation link is invalid" };
  }
  if (invitation.status === "ACCEPTED") {
    return { ok: false as const, error: "This invitation has already been used" };
  }
  if (invitation.status === "REVOKED") {
    return { ok: false as const, error: "This invitation was revoked" };
  }
  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    if (invitation.status === "PENDING") {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
    }
    return { ok: false as const, error: "This invitation has expired" };
  }
  if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return {
      ok: false as const,
      error: `Sign in with ${invitation.email} to accept this invitation`,
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { role: invitation.role, operatorCode: invitation.operatorCode },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        acceptedUserId: session.user.id,
        acceptedAt: new Date(),
      },
    }),
  ]);

  revalidatePath("/settings/invitations");
  revalidatePath("/settings/members");
  return {
    ok: true as const,
    data: {
      role: invitation.role as AppRole,
      operatorCode: invitation.operatorCode,
    },
  };
}
