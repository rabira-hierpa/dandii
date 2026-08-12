"use client";

import type { RouteEditorDetail } from "@/types/console";

interface RouteTripsTabProps {
  readonly detail: RouteEditorDetail;
}

/**
 * Read-only summary of a route's service, one row per direction.
 *
 * Deliberately not per-trip yet: the feed runs these as frequency-based service
 * (891 trips, 891 frequency rows, a single calendar), so listing individual
 * trips would show 400+ near-identical rows that say less than the headway
 * does. Per-trip times and block ids arrive with the timetable editor.
 */
export function RouteTripsTab({ detail }: RouteTripsTabProps) {
  if (detail.directions.length === 0) {
    return (
      <p className="py-3 text-center text-[12.5px] text-[#7E9182]">
        This route has no trips yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-[#E2E6DE] text-left text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
            <th className="py-1.5 pr-2 font-semibold">Direction</th>
            <th className="py-1.5 pr-2 font-semibold">Trips</th>
            <th className="py-1.5 pr-2 font-semibold">Stops</th>
            <th className="py-1.5 font-semibold">Shape</th>
          </tr>
        </thead>
        <tbody>
          {detail.directions.map((d) => (
            <tr key={d.directionId} className="border-b border-[#F0F2ED]">
              <td className="py-2 pr-2 text-[#1C2321]">
                {d.headsign ?? `Direction ${d.directionId}`}
              </td>
              <td className="py-2 pr-2 text-[#3D4A3F]">{d.tripCount}</td>
              <td className="py-2 pr-2 text-[#3D4A3F]">{d.stopCount}</td>
              <td className="py-2 text-[#7E9182]">
                {d.shapePoints > 0 ? `${d.shapePoints} pts` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-[#7E9182]">
        Service runs on headways rather than a fixed timetable, so trips are
        summarised per direction. Departure times and block ids come with the
        timetable editor.
      </p>
    </div>
  );
}
