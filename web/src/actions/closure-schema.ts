import { z } from "zod";
import { CLOSURE_REASONS } from "@/lib/operators";

const closureKinds = ["WHOLE_ROUTE", "SEVERED", "SKIPPED"] as const;

/** One-minute grace so "now" from a slightly-lagged client still validates. */
const PAST_GRACE_MS = 60_000;

export const closureSchema = z
  .object({
    routeId: z.string().min(1),
    reason: z.enum(CLOSURE_REASONS),
    note: z.string().max(500).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    kind: z.enum(closureKinds).default("WHOLE_ROUTE"),
    fromStopId: z.string().min(1).optional().nullable(),
    toStopId: z.string().min(1).optional().nullable(),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: "End must be after start",
    path: ["endsAt"],
  })
  .refine((data) => data.startsAt.getTime() >= Date.now() - PAST_GRACE_MS, {
    message: "Start cannot be in the past",
    path: ["startsAt"],
  })
  .refine((data) => data.endsAt.getTime() >= Date.now() - PAST_GRACE_MS, {
    message: "End cannot be in the past",
    path: ["endsAt"],
  })
  .superRefine((data, ctx) => {
    if (data.kind === "WHOLE_ROUTE") return;
    if (!data.fromStopId || !data.toStopId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Partial closures need both ends of the closed stop range",
        path: ["fromStopId"],
      });
    }
  });

export type ClosureInput = z.input<typeof closureSchema>;
export type ClosureParsed = z.output<typeof closureSchema>;
