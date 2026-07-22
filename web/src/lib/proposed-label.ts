/** Format a proposed fare for list UIs (profile, account menu, library rail). */
export function formatProposedLabel(p: {
  proposedKind: "FLAT" | "TIERED";
  proposedFlatEtb: { toNumber(): number } | null;
  proposedTiers: unknown;
}): string {
  if (p.proposedKind === "FLAT") {
    return `Flat · ${p.proposedFlatEtb?.toNumber() ?? 0} ETB`;
  }
  const tiers = (p.proposedTiers as { amountEtb: number }[] | null) ?? [];
  if (tiers.length === 0) return "Tiered";
  const amounts = tiers.map((t) => t.amountEtb);
  return `Tiered · ${Math.min(...amounts)}–${Math.max(...amounts)} ETB`;
}
