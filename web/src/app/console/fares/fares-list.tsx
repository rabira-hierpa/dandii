"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkSetFare } from "@/actions/fares";
import { useConsoleFilters } from "@/stores/console-filters-store";
import { cx } from "@/utils/cx";
import { FareRow, type FareRowData } from "./fare-row";

const TIER_TEMPLATE = [
  { label: "Short hop", fromKm: 0, toKm: 3, amountEtb: 15 },
  { label: "Mid", fromKm: 3, toKm: 7, amountEtb: 25 },
  { label: "Full corridor", fromKm: 7, toKm: null, amountEtb: 35 },
];

/**
 * Fare rows with selection + bulk apply: set one flat amount, or apply the
 * standard tiered template, across every selected route in one action.
 */
export function FaresList({
  rows,
  readOnly,
}: {
  rows: FareRowData[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flatAmount, setFlatAmount] = useState(15);
  const [isPending, startTransition] = useTransition();
  const setLastChange = useConsoleFilters((s) => s.setLastChange);

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.routeId));
  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(rows.map((r) => r.routeId)),
    );
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = (payload: Parameters<typeof bulkSetFare>[0]) => {
    startTransition(async () => {
      try {
        const result = await bulkSetFare(payload);
        setLastChange(`Fares updated on ${result.count} routes`);
        setSelected(new Set());
        router.refresh();
      } catch {
        setLastChange("Not allowed to update fares");
      }
    });
  };

  return (
    <>
      {!readOnly && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-[#D6DCD0] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#1C2321]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all routes on this page"
              className="size-4 cursor-pointer accent-[#15803D]"
            />
            Select page
          </label>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#D6DCD0] bg-white px-3 py-2">
              <span className="text-[12.5px] font-semibold text-[#1C2321]">
                {selected.size} selected
              </span>
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={flatAmount}
                  onChange={(e) => setFlatAmount(Number(e.target.value))}
                  aria-label="Bulk flat fare amount"
                  className="w-18 rounded-lg border border-[#D6DCD0] bg-white px-2 py-1.5 text-[12.5px] font-semibold tabular-nums"
                />
                <button
                  onClick={() =>
                    apply({
                      routeIds: [...selected],
                      kind: "FLAT",
                      flatAmountEtb: flatAmount,
                    })
                  }
                  disabled={isPending}
                  className="cursor-pointer rounded-lg bg-[#15803D] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
                >
                  Set flat ETB
                </button>
              </span>
              <button
                onClick={() =>
                  apply({
                    routeIds: [...selected],
                    kind: "TIERED",
                    tiers: TIER_TEMPLATE,
                  })
                }
                disabled={isPending}
                className="cursor-pointer rounded-lg border border-[#D6DCD0] px-3 py-1.5 text-[12.5px] font-semibold text-[#3D4A3F] hover:bg-[#F4F5F2] disabled:opacity-40"
              >
                Apply tiered template
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="cursor-pointer px-1 text-[12.5px] font-medium text-[#5C6B5E] hover:text-[#1C2321]"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.routeId}
            className={cx(
              "flex items-start gap-2.5",
              selected.has(row.routeId) && "rounded-2xl ring-2 ring-[#86B98F]",
            )}
          >
            {!readOnly && (
              <input
                type="checkbox"
                checked={selected.has(row.routeId)}
                onChange={() => toggleOne(row.routeId)}
                aria-label={`Select ${row.shortName}`}
                className="mt-6 ml-1 size-4 shrink-0 cursor-pointer accent-[#15803D]"
              />
            )}
            <div className="min-w-0 flex-1">
              <FareRow data={row} readOnly={readOnly} />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-[#E2E6DE] bg-white p-8 text-center text-[13.5px] text-[#5C6B5E]">
            No routes match your search.
          </div>
        )}
      </div>
    </>
  );
}
