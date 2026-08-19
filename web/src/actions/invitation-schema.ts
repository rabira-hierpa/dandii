import { z } from "zod";
import { OPERATOR_CODES } from "@/lib/operators";
import { APP_ROLES, OPERATOR_SCOPED_ROLES } from "@/lib/permissions";

export const invitationCreateSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    role: z.enum(APP_ROLES),
    operatorCode: z.enum(OPERATOR_CODES).nullish(),
  })
  .superRefine((value, ctx) => {
    const needsOperator = (OPERATOR_SCOPED_ROLES as readonly string[]).includes(
      value.role,
    );
    if (needsOperator && !value.operatorCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operatorCode"],
        message: "Choose which operator this person works for",
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

export const invitationTokenSchema = z.object({
  token: z.string().min(1),
});

export type InvitationCreateInput = z.input<typeof invitationCreateSchema>;
export type InvitationTokenInput = z.input<typeof invitationTokenSchema>;
