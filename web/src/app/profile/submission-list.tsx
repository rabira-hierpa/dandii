"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "@untitledui/icons";
import { RouteChip } from "@/components/console/route-chip";
import type { SubmissionItem } from "@/lib/account";
import type { OperatorCode } from "@/lib/operators";
import { cx } from "@/utils/cx";

const STATUS_STYLE: Record<
  SubmissionItem["status"],
  { bg: string; fg: string; label: string }
> = {
  PENDING: { bg: "#FEF3C7", fg: "#92400E", label: "Pending" },
  APPROVED: { bg: "#DCFCE7", fg: "#166534", label: "Approved" },
  REJECTED: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejected" },
  SUPERSEDED: { bg: "#E8EAED", fg: "#5F6368", label: "Resolved" },
};

/** Short, readable date — the exact time isn't useful here. */
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SubmissionRow({ submission }: Readonly<{ submission: SubmissionItem }>) {
  const [open, setOpen] = useState(false);
  const status = STATUS_STYLE[submission.status];
  const detailId = `submission-detail-${submission.id}`;

  return (
    <div
      className={cx(
        "overflow-hidden rounded-xl border transition-colors",
        open ? "border-[#86B98F] bg-[#F8FAF6]" : "border-[#EEF1EA] bg-white",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailId}
        className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left hover:bg-[#F8FAF6]"
      >
        <RouteChip
          shortName={submission.routeShortName}
          operatorCode={submission.operatorCode as OperatorCode | null}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-[#202124]">
            {submission.routeLongName}
          </span>
          <span className="block truncate text-[12px] text-[#5F6368]">
            {submission.proposedLabel} · {formatDate(submission.createdAt)}
          </span>
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ background: status.bg, color: status.fg }}
        >
          {status.label}
        </span>
        <ChevronDown
          className={cx(
            "size-4 shrink-0 text-[#5F6368] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={detailId}
          className="flex flex-col gap-3 border-t border-[#EEF1EA] px-3.5 py-3"
        >
          {/* What the fare was, and what you proposed */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
              Fare change
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-lg bg-white px-2.5 py-1 text-[#5F6368] ring-1 ring-[#E2E6DE]">
                {submission.baselineLabel ?? "No fare on record"}
              </span>
              <ArrowRight className="size-3.5 text-[#9AA0A6]" aria-hidden />
              <span className="rounded-lg bg-[#E8F0FE] px-2.5 py-1 font-semibold text-[#1A73E8]">
                {submission.proposedLabel}
              </span>
            </div>
          </div>

          {submission.note && (
            <div>
              <div className="text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
                Your note
              </div>
              <p className="mt-1 text-[13px] text-[#3C4043]">{submission.note}</p>
            </div>
          )}

          {submission.reviewNote && (
            <div>
              <div className="text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
                Reviewer note
              </div>
              <p className="mt-1 text-[13px] text-[#3C4043]">
                {submission.reviewNote}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#5F6368]">
            <span>Submitted {formatDate(submission.createdAt)}</span>
            {submission.decidedAt && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {status.label} {formatDate(submission.decidedAt)}
                </span>
              </>
            )}
          </div>

          <Link
            href={`/?route=${encodeURIComponent(submission.routeId)}`}
            className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#1A73E8] hover:underline"
          >
            View {submission.routeShortName} on the map
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}

export function SubmissionList({
  submissions,
}: Readonly<{ submissions: SubmissionItem[] }>) {
  if (submissions.length === 0) {
    return (
      <p className="text-[13px] text-[#5F6368]">
        No fare edits yet — open any route on the map and suggest a correction
        when the posted fare has changed.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {submissions.map((s) => (
        <SubmissionRow key={s.id} submission={s} />
      ))}
    </div>
  );
}
