"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitProposal } from "@/actions/fare-proposals";
import type { SubmitProposalInput } from "@/actions/proposal-schema";
import { cx } from "@/utils/cx";
import type { RouteDetail } from "./types";

interface FareProposalFormProps {
  routeId: string;
  shortName: string;
  fare: RouteDetail["fare"];
  signedIn: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TierDraft = {
  label: string;
  fromKm: number;
  toKm: number | null;
  amount: string;
};

export function FareProposalForm({
  routeId,
  shortName,
  fare,
  signedIn,
  open,
  onOpenChange,
}: Readonly<FareProposalFormProps>) {
  const [flat, setFlat] = useState(String(fare?.flatAmountEtb ?? ""));
  const [tiers, setTiers] = useState<TierDraft[]>(
    (fare?.tiers ?? []).map((t) => ({
      label: t.label,
      fromKm: t.fromKm,
      toKm: t.toKm,
      amount: String(t.amountEtb),
    })),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const kind = fare?.kind ?? "FLAT";

  if (!signedIn) {
    return (
      <Link
        href="/sign-in"
        className="block w-full rounded-lg border border-[#D6DCD0] bg-white py-2 text-center text-[12.5px] font-semibold text-[#1A73E8] hover:bg-[#F8FBFF]"
      >
        Sign in to suggest a fare correction
      </Link>
    );
  }

  if (done) {
    return (
      <div className="w-full rounded-lg bg-[#DCFCE7] px-3 py-2.5 text-[12.5px] font-medium text-[#166534]">
        Submitted · pending review. You&apos;ll see the outcome under My fare
        submissions.
      </div>
    );
  }

  if (!open) return null;

  const submit = () => {
    setError(null);
    let input: SubmitProposalInput;
    if (kind === "FLAT") {
      const amount = Number(flat);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Enter a fare amount greater than 0");
        return;
      }
      input = {
        routeId,
        kind: "FLAT",
        flatAmountEtb: amount,
        note: note || undefined,
      };
    } else {
      const parsed = tiers.map((t) => ({
        label: t.label,
        fromKm: t.fromKm,
        toKm: t.toKm,
        amountEtb: Number(t.amount),
      }));
      if (
        parsed.some((t) => !Number.isFinite(t.amountEtb) || t.amountEtb <= 0)
      ) {
        setError("Each tier needs an amount greater than 0");
        return;
      }
      input = {
        routeId,
        kind: "TIERED",
        tiers: parsed,
        note: note || undefined,
      };
    }
    startTransition(async () => {
      const res = await submitProposal(input);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  };

  const numberInput =
    "w-20 rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-1.5 text-[13.5px] font-semibold text-[#1C2321] tabular-nums focus:outline-2 focus:outline-[#1A73E833]";

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-xl border border-[#D6DCD0] bg-[#F8FAF6] p-3">
      <div className="text-[12px] font-semibold text-[#1C2321]">
        What is the current fare on {shortName}?
      </div>

      {kind === "FLAT" ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="decimal"
            value={flat}
            onChange={(e) => setFlat(e.target.value)}
            aria-label={`Current flat fare for ${shortName}`}
            className={numberInput}
          />
          <span className="text-[12.5px] text-[#5C6B5E]">ETB / trip</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-28 text-[11.5px] text-[#5C6B5E]">
                {t.label}
              </span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={t.amount}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((p, j) =>
                      j === i ? { ...p, amount: e.target.value } : p,
                    ),
                  )
                }
                aria-label={`${t.label} fare`}
                className={numberInput}
              />
              <span className="text-[11.5px] text-[#5C6B5E]">ETB</span>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional) — e.g. conductor charging this since Monday"
        aria-label="Note about this fare change"
        rows={2}
        className="w-full resize-none rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[12.5px] text-[#1C2321] focus:outline-2 focus:outline-[#1A73E833]"
      />

      {error && <div className="text-[12px] text-[#B91C1C]">{error}</div>}

      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={isPending}
          className={cx(
            "cursor-pointer rounded-lg bg-[#1A73E8] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1765CC] disabled:opacity-40",
          )}
        >
          {isPending ? "Submitting…" : "Submit correction"}
        </button>
        <button
          onClick={() => onOpenChange(false)}
          className="cursor-pointer px-2 text-[12.5px] font-medium text-[#5C6B5E] hover:text-[#1C2321]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
