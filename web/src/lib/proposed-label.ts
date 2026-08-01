/** Format a proposed fare for list UIs (profile, account menu, library rail). */
export function formatProposedLabel(p: {
  proposedKind: "FLAT" | "TIERED";
  proposedFlatEtb: { toNumber(): number } | null;
  proposedTiers: unknown;
}): string {
  return formatFareLabel(p.proposedKind, p.proposedFlatEtb, p.proposedTiers);
}

/**
 * Format the fare as it stood when the proposal was submitted. Null when the
 * route had no fare on record — the submission detail shows "no fare on record"
 * rather than a misleading 0 ETB.
 */
export function formatBaselineLabel(p: {
  baselineKind: "FLAT" | "TIERED" | null;
  baselineFlatEtb: { toNumber(): number } | null;
  baselineTiers: unknown;
}): string | null {
  if (!p.baselineKind) return null;
  return formatFareLabel(p.baselineKind, p.baselineFlatEtb, p.baselineTiers);
}

function formatFareLabel(
  kind: "FLAT" | "TIERED",
  flatEtb: { toNumber(): number } | null,
  tiersJson: unknown,
): string {
  if (kind === "FLAT") {
    return `Flat · ${flatEtb?.toNumber() ?? 0} ETB`;
  }
  const tiers = (tiersJson as { amountEtb: number }[] | null) ?? [];
  if (tiers.length === 0) return "Tiered";
  const amounts = tiers.map((t) => t.amountEtb);
  return `Tiered · ${Math.min(...amounts)}–${Math.max(...amounts)} ETB`;
}
