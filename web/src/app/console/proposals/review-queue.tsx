"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, MessageQuestionCircle, X } from "@untitledui/icons";
import { reviewProposal } from "@/actions/fare-proposals";
import { RouteChip } from "@/components/console/route-chip";
import type { OperatorCode } from "@/lib/operators";

export interface ProposalItem {
  id: string;
  submitterName: string;
  createdAt: string;
  note: string | null;
  proposedLabel: string;
  proposedKey: string;
  baselineLabel: string;
  /** The live fare drifted from what the rider saw when submitting. */
  baselineChanged: boolean;
}

export interface RouteGroup {
  routeId: string;
  shortName: string;
  longName: string;
  operatorCode: OperatorCode | null;
  currentLabel: string;
  proposals: ProposalItem[];
  agreement: { count: number; label: string } | null;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ProposalCard({
  proposal,
  siblingCount,
  onDecided,
}: {
  proposal: ProposalItem;
  /** Other pendings on the same route — approving this resolves them too. */
  siblingCount: number;
  onDecided: (decision: "approve" | "reject", proposalId: string) => void;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const decide = (decision: "approve" | "reject") => {
    setError(null);
    startTransition(async () => {
      const res = await reviewProposal({
        proposalId: proposal.id,
        decision,
        reviewNote: note.trim() || undefined,
      });
      if (res.ok) {
        onDecided(decision, proposal.id);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="rounded-xl border border-[#EEF1EA] bg-white p-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold text-[#1C2321]">
          {proposal.submitterName}
        </span>
        <span className="text-[11.5px] text-[#7E9182]">
          {timeAgo(proposal.createdAt)}
        </span>
      </div>

      {/* Three-way: what they saw (baseline) → what they propose. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-[#7E9182] line-through">
          {proposal.baselineLabel}
        </span>
        <span className="text-[#9AA69C]">→</span>
        <span className="rounded-md bg-[#DCFCE7] px-2 py-0.5 font-semibold text-[#166534]">
          {proposal.proposedLabel}
        </span>
      </div>

      {proposal.baselineChanged && (
        <div className="mt-1.5 text-[11.5px] text-[#B45309]">
          Heads up — the live fare has changed since this was submitted.
        </div>
      )}

      {proposal.note && (
        <div className="mt-2 rounded-lg bg-[#F8FAF6] px-3 py-2 text-[12.5px] text-[#3D4A3F]">
          “{proposal.note}”
        </div>
      )}

      {error && <div className="mt-2 text-[12px] text-[#B91C1C]">{error}</div>}

      {rejecting ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Reason (optional) — shown to the rider"
            aria-label="Rejection reason"
            className="w-full resize-none rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[12.5px] text-[#1C2321] focus:outline-2 focus:outline-[#1A73E833]"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => decide("reject")}
              disabled={isPending}
              className="cursor-pointer rounded-lg bg-[#B91C1C] px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#991B1B] disabled:opacity-40"
            >
              {isPending ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              onClick={() => {
                setRejecting(false);
                setNote("");
              }}
              className="cursor-pointer px-2 text-[12.5px] font-medium text-[#5C6B5E] hover:text-[#1C2321]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => decide("approve")}
            disabled={isPending}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#15803D] px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#136B34] disabled:opacity-40"
          >
            <CheckCircle className="size-4" />
            {isPending ? "Approving…" : "Approve"}
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={isPending}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#D6DCD0] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#3D4A3F] hover:bg-[#F4F5F2] disabled:opacity-40"
          >
            <X className="size-4" />
            Reject
          </button>
          {siblingCount > 0 && (
            <span className="text-[11.5px] text-[#7E9182]">
              Approving resolves {siblingCount} other{" "}
              {siblingCount === 1 ? "suggestion" : "suggestions"} on this route
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewQueue({ groups }: { groups: RouteGroup[] }) {
  // Optimistic resolution: approving clears the whole route group (siblings
  // are superseded server-side); rejecting clears just that proposal.
  const [resolvedGroups, setResolvedGroups] = useState<Set<string>>(new Set());
  const [resolvedProposals, setResolvedProposals] = useState<Set<string>>(
    new Set(),
  );

  const onDecided =
    (routeId: string) =>
    (decision: "approve" | "reject", proposalId: string) => {
      if (decision === "approve") {
        setResolvedGroups((prev) => new Set(prev).add(routeId));
      } else {
        setResolvedProposals((prev) => new Set(prev).add(proposalId));
      }
    };

  const visibleGroups = groups
    .filter((g) => !resolvedGroups.has(g.routeId))
    .map((g) => ({
      ...g,
      proposals: g.proposals.filter((p) => !resolvedProposals.has(p.id)),
    }))
    .filter((g) => g.proposals.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#D6DCD0] bg-white py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-[#F0F5EE]">
          <MessageQuestionCircle className="size-6 text-[#15803D]" />
        </span>
        <div className="text-[15px] font-semibold text-[#1C2321]">
          You&apos;re all caught up
        </div>
        <p className="max-w-sm text-[13px] text-[#5C6B5E]">
          No fare corrections are waiting for review. Rider submissions from the
          public map will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleGroups.map((group) => (
        <section
          key={group.routeId}
          className="rounded-2xl border border-[#E4E9DF] bg-[#FBFCFA] p-4"
        >
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <RouteChip
              shortName={group.shortName}
              operatorCode={group.operatorCode}
            />
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#1C2321]">
              {group.longName}
            </span>
            <span className="text-[12px] text-[#5C6B5E]">
              Current:{" "}
              <span className="font-semibold text-[#1C2321]">
                {group.currentLabel}
              </span>
            </span>
          </div>

          {group.agreement && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-2.5 py-1 text-[12px] font-semibold text-[#166534]">
              <CheckCircle className="size-3.5" />
              {group.agreement.count} riders agree · {group.agreement.label}
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {group.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                siblingCount={group.proposals.length - 1}
                onDecided={onDecided(group.routeId)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
