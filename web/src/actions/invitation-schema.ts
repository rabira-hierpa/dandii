import { z } from "zod";
import { APP_ROLES } from "@/lib/permissions";

export const invitationCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(APP_ROLES),
});

export const invitationTokenSchema = z.object({
  token: z.string().min(1),
});

export type InvitationCreateInput = z.input<typeof invitationCreateSchema>;
export type InvitationTokenInput = z.input<typeof invitationTokenSchema>;
