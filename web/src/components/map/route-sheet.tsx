"use client";

import {
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  X as CloseX,
  Edit04,
  Share06,
} from "@untitledui/icons";
import { RouteChip } from "@/components/console/route-chip";
import {
  Tooltip,
  TooltipTrigger,
} from "@/components/base/tooltip/tooltip";
import {
  CLOSURE_REASON_LABELS,
  type ClosureReasonValue,
} from "@/lib/operators";
import { cx } from "@/utils/cx";
import { FareProposalForm } from "./fare-proposal-form";
import type { RouteDetail } from "./types";
import { useMemo, useState } from "react";

function formatHeadway(secs: number) {
  const minutes = Math.round(secs / 60);
  return `every ${minutes} min`;
}

const actionBtn = (active: boolean) =>
  cx(
    "cursor-pointer rounded-lg p-1 hover:bg-[#F4F5F2]",
    active ? "text-[#1A73E8]" : "text-[#9AA69C] hover:text-[#3D4A3F]",
  );

export function RouteSheet({
  detail,
  onClose,
  signedIn = false,
  isSaved = false,
  onToggleSave,
  selectedRoute,
}: Readonly<{
  detail: RouteDetail;
  onClose: () => void;
  signedIn?: boolean;
  isSaved?: boolean;
  onToggleSave?: () => void;
  selectedRoute: { id: string; shortName: string } | null;
}>) {
  const [copied, setCopied] = useState(false);
  const [editingFare, setEditingFare] = useState(false);

  const shareUrl = useMemo(
    () =>
      selectedRoute && typeof window !== "undefined"
        ? `${window.location.origin}/?route=${selectedRoute.id}`
        : null,
    [selectedRoute],
  );

  const copyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-2xl bg-[#F8F9FA]">
      <div className="flex items-start gap-2.5 border-b border-[#EEF1EA] p-4">
        <RouteChip
          shortName={detail.shortName}
          operatorCode={detail.operator?.code ?? null}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-snug font-semibold text-[#1C2321]">
            {detail.longName}
          </div>
          <div className="mt-0.5 text-xs text-[#5C6B5E]">
            {detail.operator?.name ?? "Unassigned"}
            {detail.lengthMeters
              ? ` · ${(detail.lengthMeters / 1000).toFixed(1)} km`
              : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close route details"
          className="cursor-pointer rounded-lg p-1 text-[#9AA69C] hover:bg-[#F4F5F2] hover:text-[#3D4A3F]"
        >
          <CloseX className="size-4.5" />
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        {detail.closure && (
          <div className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2.5 text-[12.5px] text-[#991B1B]">
            <div className="font-bold">
              Route closed —{" "}
              {CLOSURE_REASON_LABELS[
                detail.closure.reason as ClosureReasonValue
              ] ?? detail.closure.reason}
            </div>
            {detail.closure.note && <div>{detail.closure.note}</div>}
            <div className="mt-0.5 text-[11.5px] opacity-75">
              until {new Date(detail.closure.endsAt).toLocaleString()}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-[#F8FAF6] px-3 py-2.5">
            <div className="text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
              Fare
            </div>
            <div className="mt-0.5 text-[13px] font-semibold text-[#1C2321]">
              {detail.fare?.summary ?? "—"}
            </div>
          </div>
          <div className="rounded-lg bg-[#F8FAF6] px-3 py-2.5">
            <div className="text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
              Headway
            </div>
            <div className="mt-0.5 text-[13px] font-semibold text-[#1C2321]">
              {detail.frequencies[0]
                ? formatHeadway(detail.frequencies[0].headwaySecs)
                : "—"}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          {signedIn && (
            <div className="flex items-center justify-center gap-5">
              {onToggleSave && (
                <Tooltip
                  title={isSaved ? "Unsave route" : "Save route"}
                  placement="top"
                  delay={200}
                >
                  <TooltipTrigger
                    onPress={onToggleSave}
                    aria-label={isSaved ? "Unsave route" : "Save route"}
                    aria-pressed={isSaved}
                    className={actionBtn(isSaved)}
                  >
                    {isSaved ? (
                      <BookmarkCheck className="size-8" />
                    ) : (
                      <Bookmark className="size-8" />
                    )}
                  </TooltipTrigger>
                </Tooltip>
              )}
              {selectedRoute && (
                <Tooltip
                  title={copied ? "Link copied" : "Copy share link"}
                  placement="top"
                  delay={200}
                >
                  <TooltipTrigger
                    onPress={copyShare}
                    aria-label={copied ? "Link copied" : "Copy share link"}
                    className={actionBtn(copied)}
                  >
                    {copied ? (
                      <CheckCircle className="size-8" />
                    ) : (
                      <Share06 className="size-8" />
                    )}
                  </TooltipTrigger>
                </Tooltip>
              )}
              <Tooltip
                title={
                  editingFare
                    ? "Close fare correction"
                    : "Suggest fare correction"
                }
                placement="top"
                delay={200}
              >
                <TooltipTrigger
                  onPress={() => setEditingFare((v) => !v)}
                  aria-label={
                    editingFare
                      ? "Close fare correction"
                      : "Suggest fare correction"
                  }
                  aria-pressed={editingFare}
                  className={actionBtn(editingFare)}
                >
                  <Edit04 className="size-8" />
                </TooltipTrigger>
              </Tooltip>
            </div>
          )}

          <FareProposalForm
            routeId={detail.id}
            shortName={detail.shortName}
            fare={detail.fare}
            signedIn={signedIn}
            open={editingFare}
            onOpenChange={setEditingFare}
          />
        </div>

        {detail.fare?.kind === "TIERED" && detail.fare.tiers.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
              Fare tiers
            </div>
            <div className="flex flex-col gap-1">
              {detail.fare.tiers.map((tier, i) => (
                <div
                  key={i}
                  className="flex justify-between text-[12.5px] text-[#3D4A3F]"
                >
                  <span>{tier.label}</span>
                  <span className="font-semibold tabular-nums">
                    {tier.amountEtb} ETB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.frequencies.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
              Service
            </div>
            <div className="flex flex-col gap-1">
              {detail.frequencies.map((f, i) => (
                <div
                  key={i}
                  className="flex justify-between text-[12.5px] text-[#3D4A3F]"
                >
                  <span className="font-mono">
                    {f.startTime.slice(0, 5)}–{f.endTime.slice(0, 5)}
                  </span>
                  <span>{formatHeadway(f.headwaySecs)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.stops.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
              Stops ({detail.stops.length})
            </div>
            <ol className="flex flex-col">
              {detail.stops.map((stop, i) => (
                <li
                  key={`${stop.id}-${i}`}
                  className="relative flex items-center gap-2.5 py-1 pl-0.5 text-[12.5px] text-[#3D4A3F]"
                >
                  <span className="relative flex h-full w-3 items-center justify-center">
                    <span className="z-10 size-2 rounded-full border-2 border-[#15803D] bg-white" />
                    {i < detail.stops.length - 1 && (
                      <span className="absolute top-1/2 left-1/2 h-full w-0.5 -translate-x-1/2 bg-[#D6DCD0]" />
                    )}
                  </span>
                  <span className="min-w-0 truncate">{stop.name}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
