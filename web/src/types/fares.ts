/** Where a fare change came from. Mirrors the `FareChangeSource` enum. */
export type FareChangeSource = "PROPOSAL_APPROVAL" | "CONSOLE_EDIT" | "RESEED";

/** A fare as it stood on one side of a change. Null when there was no fare. */
export interface FareSnapshot {
  kind: "FLAT" | "TIERED" | null;
  flatEtb: string | null;
  tierCount: number;
}

/** One entry in a route's fare history, as the console renders it. */
export interface FareHistoryEntry {
  id: string;
  source: FareChangeSource;
  changedByName: string;
  proposalId: string | null;
  createdAt: string;
  before: FareSnapshot;
  after: FareSnapshot;
}
