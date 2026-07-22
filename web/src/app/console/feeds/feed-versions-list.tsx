"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download01, Package, RefreshCcw01 } from "@untitledui/icons";
import { generateFeed } from "@/actions/feed";

export interface FeedVersionRow {
  version: number;
  label: string;
  sizeBytes: number;
  fareChangeCount: number;
  validatorStatus: "PENDING" | "PASS" | "WARN" | "FAIL";
  generatedByName: string;
  createdAt: string;
}

const VALIDATOR_STYLE: Record<
  FeedVersionRow["validatorStatus"],
  { bg: string; fg: string; label: string }
> = {
  PENDING: { bg: "#FEF3C7", fg: "#92400E", label: "Validate out-of-band" },
  PASS: { bg: "#DCFCE7", fg: "#166534", label: "Passed" },
  WARN: { bg: "#FEF3C7", fg: "#92400E", label: "Warnings" },
  FAIL: { bg: "#FEE2E2", fg: "#991B1B", label: "Failed" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function FeedVersionsList({
  rows,
  flatFareCount,
  unpublishedChanges,
  pendingProposals,
}: {
  rows: FeedVersionRow[];
  flatFareCount: number;
  unpublishedChanges: number;
  pendingProposals: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [justMade, setJustMade] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const generate = () => {
    setError(null);
    setJustMade(null);
    startTransition(async () => {
      const res = await generateFeed();
      if (res.ok) {
        setJustMade(res.version);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Generate panel */}
      <div className="rounded-2xl border border-[#E4E9DF] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1C2321]">
              <Package className="size-4.5 text-[#15803D]" />
              Generate a new GTFS version
            </div>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#5C6B5E]">
              Overlays the current flat fares onto the base feed and writes a
              versioned zip. Tiered fares are omitted from GTFS V1 — they still
              show in Dandii. Approved fares are already live for riders; this
              is for downstream feed consumers.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#5C6B5E]">
              <span>
                <span className="font-semibold text-[#1C2321]">
                  {flatFareCount}
                </span>{" "}
                flat fares in export
              </span>
              <span>
                <span className="font-semibold text-[#1C2321]">
                  {unpublishedChanges}
                </span>{" "}
                fare change{unpublishedChanges === 1 ? "" : "s"} since last
                version
              </span>
              {pendingProposals > 0 && (
                <span className="text-[#B45309]">
                  {pendingProposals} proposal
                  {pendingProposals === 1 ? "" : "s"} still pending review
                </span>
              )}
            </div>
          </div>
          <button
            onClick={generate}
            disabled={isPending}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#152018] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#24352A] disabled:opacity-50"
          >
            <RefreshCcw01
              className={isPending ? "size-4 animate-spin" : "size-4"}
            />
            {isPending ? "Generating…" : "Generate version"}
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-[#FEE2E2] px-3 py-2 text-[12.5px] text-[#991B1B]">
            {error}
          </div>
        )}
        {justMade != null && (
          <div className="mt-3 rounded-lg bg-[#DCFCE7] px-3 py-2 text-[12.5px] font-medium text-[#166534]">
            Generated v{justMade}. Download it below and run the validator
            out-of-band before publishing.
          </div>
        )}
      </div>

      {/* Versions list */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D6DCD0] bg-white py-14 text-center">
          <div className="text-[15px] font-semibold text-[#1C2321]">
            No feed versions yet
          </div>
          <p className="mt-1 text-[13px] text-[#5C6B5E]">
            Generate the first version to publish a fares-overlaid GTFS zip.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E4E9DF] bg-white">
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 border-b border-[#EEF1EA] px-5 py-2.5 text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase max-sm:hidden">
            <span>Version</span>
            <span>Details</span>
            <span className="text-right">Download</span>
          </div>
          {rows.map((row) => {
            const vs = VALIDATOR_STYLE[row.validatorStatus];
            return (
              <div
                key={row.version}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5 border-b border-[#F1F3EE] px-5 py-3.5 last:border-b-0 max-sm:grid-cols-1"
              >
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md bg-[#EEF1EA] px-2 py-0.5 font-mono text-[13px] font-bold text-[#1C2321]">
                    {row.label}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                    style={{ background: vs.bg, color: vs.fg }}
                  >
                    {vs.label}
                  </span>
                </div>
                <div className="min-w-0 text-[12.5px] text-[#5C6B5E]">
                  <span className="font-medium text-[#3D4A3F]">
                    {formatBytes(row.sizeBytes)}
                  </span>
                  {" · "}
                  {row.fareChangeCount} fare change
                  {row.fareChangeCount === 1 ? "" : "s"}
                  {" · "}
                  {formatDate(row.createdAt)}
                  {" · by "}
                  {row.generatedByName}
                </div>
                <a
                  href={`/api/feeds/${row.version}/download`}
                  className="flex shrink-0 items-center gap-1.5 justify-self-start rounded-lg border border-[#D6DCD0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#3D4A3F] hover:bg-[#F4F5F2] sm:justify-self-end"
                >
                  <Download01 className="size-4" />
                  Download zip
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
