"use client";

import type { RouteStop } from "@/types/console";

const selectClass =
  "cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321]";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]";

interface PartialRangeFieldsProps {
  readonly stopsLoading: boolean;
  readonly routeStops: RouteStop[];
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly kind: "SEVERED" | "SKIPPED";
  readonly previewSentence: string | null;
  readonly onFrom: (id: string) => void;
  readonly onTo: (id: string) => void;
  readonly onKind: (kind: "SEVERED" | "SKIPPED") => void;
}

/**
 * The closed-stop range and what happens on the road.
 *
 * SEVERED and SKIPPED carry identical data and differ only in whether traffic
 * gets through, so they are phrased as what an operator saw rather than as enum
 * names, with a live preview of the sentence riders will read.
 */
export function PartialRangeFields({
  stopsLoading,
  routeStops,
  fromStopId,
  toStopId,
  kind,
  previewSentence,
  onFrom,
  onTo,
  onKind,
}: PartialRangeFieldsProps) {
  if (stopsLoading) {
    return <div className="text-[12.5px] text-[#5C6B5E]">Loading stops…</div>;
  }
  if (routeStops.length === 0) {
    return (
      <div className="text-[12.5px] text-[#B91C1C]">
        Couldn’t load stops for this route.
      </div>
    );
  }

  return (
    <>
      <label className={labelClass}>
        Closed from
        <select
          value={fromStopId}
          onChange={(e) => onFrom(e.target.value)}
          className={selectClass}
        >
          <option value="">Select stop…</option>
          {routeStops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Closed to (inclusive)
        <select
          value={toStopId}
          onChange={(e) => onTo(e.target.value)}
          className={selectClass}
        >
          <option value="">Select stop…</option>
          {routeStops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold text-[#5C6B5E]">
          What happens on the road?
        </legend>
        <label className="flex cursor-pointer gap-2 rounded-lg border border-[#D6DCD0] p-2.5 text-[12.5px] text-[#1C2321]">
          <input
            type="radio"
            name="kind"
            className="mt-0.5"
            checked={kind === "SEVERED"}
            onChange={() => onKind("SEVERED")}
          />
          <span>
            <span className="font-semibold">
              Road is blocked — buses can’t get through
            </span>
            <span className="mt-0.5 block text-[11.5px] text-[#5C6B5E]">
              Cuts the route in two
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-2 rounded-lg border border-[#D6DCD0] p-2.5 text-[12.5px] text-[#1C2321]">
          <input
            type="radio"
            name="kind"
            className="mt-0.5"
            checked={kind === "SKIPPED"}
            onChange={() => onKind("SKIPPED")}
          />
          <span>
            <span className="font-semibold">
              Buses detour around it — they just skip these stops
            </span>
            <span className="mt-0.5 block text-[11.5px] text-[#5C6B5E]">
              Line still runs end-to-end
            </span>
          </span>
        </label>
      </fieldset>
      <div
        aria-live="polite"
        className="rounded-lg bg-[#F8FAF6] px-3 py-2 text-[12.5px] text-[#3D4A3F]"
      >
        {previewSentence ?? "Pick two stops to see what riders will see."}
      </div>
    </>
  );
}
