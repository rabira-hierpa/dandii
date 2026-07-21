import { z } from "zod";

/**
 * Sane ceiling for a single fare amount in ETB. Addis bus/minibus/LRT fares
 * are 10-50 ETB; 1000 catches absurd or malicious values (outside voice #6)
 * without rejecting any legitimate long-haul fare. Validated at BOTH submit
 * and approval so no bad Decimal reaches the DB or the exported feed.
 */
export const MAX_FARE_ETB = 1000;

/** Max proposals one user may submit in a rolling 24h window. */
export const RATE_LIMIT_PER_DAY = 5;

const amount = z
  .number()
  .positive("Amount must be greater than 0")
  .max(MAX_FARE_ETB, `Amount must be ≤ ${MAX_FARE_ETB} ETB`);

const proposalTierSchema = z.object({
  label: z.string().min(1),
  fromKm: z.number().min(0),
  toKm: z.number().min(0).nullable(),
  amountEtb: amount,
});

export const submitProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    routeId: z.string().min(1),
    kind: z.literal("FLAT"),
    flatAmountEtb: amount,
    note: z.string().trim().max(280).optional(),
  }),
  z.object({
    routeId: z.string().min(1),
    kind: z.literal("TIERED"),
    tiers: z.array(proposalTierSchema).min(1),
    note: z.string().trim().max(280).optional(),
  }),
]);

export type SubmitProposalInput = z.infer<typeof submitProposalSchema>;

export const reviewProposalSchema = z.object({
  proposalId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().max(280).optional(),
});

export type ReviewProposalInput = z.infer<typeof reviewProposalSchema>;

export type ProposalTier = z.infer<typeof proposalTierSchema>;
