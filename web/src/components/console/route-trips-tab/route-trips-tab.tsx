"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTripFields } from "@/actions/trip-edit";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import type { RouteEditorDetail, RouteTripRow } from "@/types/console";
import { cx } from "@/utils/cx";

interface RouteTripsTabProps {
  readonly detail: RouteEditorDetail;
  readonly onChanged: () => void;
}

/** "06:00:00" → "06:00". Seconds are noise in a summary table. */
function hhmm(time: string | null): string {
  if (!time) return "—";
  const [h, m] = time.split(":");
  return h && m ? `${h}:${m}` : time;
}

/**
 * Every trip on the route, with an editable block id.
 *
 * block_id groups the trips one vehicle runs back to back. It matters to riders
 * because without it a through-passenger is told to alight and reboard at the
 * turnaround, and the DT4A feed has no block_id column at all — so this is the
 * one field here that is operator knowledge rather than a correction.
 */
export function RouteTripsTab({ detail, onChanged }: RouteTripsTabProps) {
  const router = useRouter();
  const setFeedback = useRouteEditorStore((s) => s.setFeedback);
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commit = (trip: RouteTripRow) => {
    const next = draft.trim();
    if (next === (trip.blockId ?? "")) {
      setEditingId(null);
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await updateTripFields({
        tripId: trip.id,
        blockId: next === "" ? null : next,
      });
      if (result.ok) {
        setFeedback({
          kind: "ok",
          message: next === "" ? "Block cleared" : `Block set to ${next}`,
        });
        setEditingId(null);
        onChanged();
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  if (detail.trips.length === 0) {
    return (
      <p className="py-3 text-center text-[12.5px] text-[#7E9182]">
        This route has no trips yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[46vh] overflow-y-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#E2E6DE] text-left text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
              <th className="py-1.5 pr-2 font-semibold">Direction</th>
              <th className="py-1.5 pr-2 font-semibold">Service</th>
              <th className="py-1.5 pr-2 font-semibold">Start</th>
              <th className="py-1.5 pr-2 font-semibold">End</th>
              <th className="py-1.5 font-semibold">Block</th>
            </tr>
          </thead>
          <tbody>
            {detail.trips.map((trip) => (
              <tr key={trip.id} className="border-b border-[#F0F2ED]">
                <td className="py-2 pr-2 text-[#1C2321]">
                  {trip.headsign ?? `Direction ${trip.directionId ?? 0}`}
                </td>
                <td className="py-2 pr-2 text-[#7E9182]">{trip.serviceId}</td>
                <td className="py-2 pr-2 font-mono text-[11.5px] text-[#3D4A3F]">
                  {hhmm(trip.startTime)}
                </td>
                <td className="py-2 pr-2 font-mono text-[11.5px] text-[#7E9182]">
                  {hhmm(trip.endTime)}
                </td>
                <td className="py-2">
                  {editingId === trip.id ? (
                    <input
                      value={draft}
                      autoFocus
                      disabled={isPending}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit(trip);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => commit(trip)}
                      placeholder="e.g. B12"
                      className="w-20 rounded border border-[#D6DCD0] px-1.5 py-0.5 text-[12px] text-[#1C2321]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(trip.id);
                        setDraft(trip.blockId ?? "");
                      }}
                      title="Set the block id for this trip"
                      className={cx(
                        "cursor-pointer rounded px-1.5 py-0.5 text-[12px] hover:bg-[#F1F3F4]",
                        trip.blockId
                          ? "font-medium text-[#1C2321]"
                          : "text-[#B6BFB3]",
                      )}
                    >
                      {trip.blockId ?? "—"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#7E9182]">
        Block ids group the trips one vehicle runs back to back, so a rider
        staying aboard isn&rsquo;t told to change. The feed carries none, so
        anything here is yours and ships in the next published version.
      </p>
    </div>
  );
}
