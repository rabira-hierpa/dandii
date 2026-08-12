"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStop, deleteStop, renameStop } from "@/actions/stop-edit";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import type { RouteEditorDetail, RouteStopRow } from "@/types/console";
import { cx } from "@/utils/cx";

interface RouteStopsTabProps {
  readonly detail: RouteEditorDetail;
  readonly onChanged: () => void;
}

const inputClass =
  "rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321] placeholder:text-[#9AA69C]";

export function RouteStopsTab({ detail, onChanged }: RouteStopsTabProps) {
  const router = useRouter();
  const directionId = useRouteEditorStore((s) => s.directionId);
  const setDirectionId = useRouteEditorStore((s) => s.setDirectionId);
  const setFeedback = useRouteEditorStore((s) => s.setFeedback);
  const [isPending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLat, setNewLat] = useState("");
  const [newLon, setNewLon] = useState("");

  const stops = detail.stopsByDirection[directionId] ?? [];
  const direction = detail.directions.find(
    (d) => d.directionId === directionId,
  );

  const refresh = () => {
    onChanged();
    router.refresh();
  };

  const submitRename = (stop: RouteStopRow) => {
    const name = draftName.trim();
    if (name === "" || name === stop.name) {
      setEditingId(null);
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await renameStop({ stopId: stop.id, name });
      if (result.ok) {
        setFeedback({ kind: "ok", message: `Renamed to “${name}”` });
        setEditingId(null);
        refresh();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  const submitDelete = (stop: RouteStopRow) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await deleteStop({ stopId: stop.id });
      if (result.ok) {
        setFeedback({ kind: "ok", message: `${stop.name} removed` });
        refresh();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  const submitCreate = () => {
    setFeedback(null);
    const lat = Number(newLat);
    const lon = Number(newLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setFeedback({ kind: "error", message: "Enter a latitude and longitude" });
      return;
    }
    startTransition(async () => {
      const result = await createStop({
        name: newName.trim(),
        lat,
        lon,
        routeId: detail.id,
        directionId: directionId === 1 ? 1 : 0,
        sequence: stops.length + 1,
      });
      if (result.ok) {
        setFeedback({
          kind: "ok",
          message: result.data.addedToRoute
            ? `${newName.trim()} added at the end of this direction`
            : `${newName.trim()} created, but this direction has no trips to add it to`,
        });
        setCreating(false);
        setNewName("");
        setNewLat("");
        setNewLon("");
        refresh();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      {detail.directions.length > 1 && (
        <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
          Direction
          <select
            value={directionId}
            onChange={(e) => setDirectionId(Number(e.target.value))}
            className={cx(inputClass, "cursor-pointer")}
          >
            {detail.directions.map((d) => (
              <option key={d.directionId} value={d.directionId}>
                {d.headsign ?? `Direction ${d.directionId}`} — {d.stopCount}{" "}
                stops
              </option>
            ))}
          </select>
        </label>
      )}

      {creating ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[#D6DCD0] bg-[#F8FAF6] p-2.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Stop name"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newLat}
              onChange={(e) => setNewLat(e.target.value)}
              placeholder="Latitude, e.g. 9.0104"
              inputMode="decimal"
              className={inputClass}
            />
            <input
              value={newLon}
              onChange={(e) => setNewLon(e.target.value)}
              placeholder="Longitude, e.g. 38.7612"
              inputMode="decimal"
              className={inputClass}
            />
          </div>
          <p className="text-[11px] text-[#7E9182]">
            Added to the end of this direction. Times are left blank — inventing
            an arrival nobody measured would be worse than leaving it empty.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitCreate}
              disabled={isPending || newName.trim() === ""}
              className="cursor-pointer rounded-lg bg-[#1C2321] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#2C3531] disabled:opacity-50"
            >
              {isPending ? "Creating…" : "Create stop"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="cursor-pointer text-[12.5px] font-medium text-[#5C6B5E] hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="cursor-pointer rounded-lg border border-dashed border-[#C3CBBD] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#3D4A3F] hover:bg-[#F8FAF6]"
        >
          + Create new stop
        </button>
      )}

      <div className="text-[11.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
        Stops ({stops.length})
        {direction?.shapePoints ? (
          <span className="ml-1.5 font-normal normal-case">
            · {direction.shapePoints} shape points
          </span>
        ) : null}
      </div>

      <ol className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto">
        {stops.map((stop) => (
          <li
            key={`${stop.sequence}-${stop.id}`}
            className="flex items-center gap-2 rounded-lg border border-[#E2E6DE] bg-white px-2.5 py-1.5"
          >
            <span className="w-5 shrink-0 text-right text-[11px] font-medium text-[#8A9A8C]">
              {stop.sequence}
            </span>
            {editingId === stop.id ? (
              <input
                value={draftName}
                autoFocus
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename(stop);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => submitRename(stop)}
                className={cx(inputClass, "min-w-0 flex-1 py-1")}
              />
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#1C2321]">
                  {stop.name}
                  {stop.edited && (
                    <span className="ml-1.5 text-[10.5px] font-medium text-[#B45309]">
                      edited
                    </span>
                  )}
                  {stop.operatorCreated && (
                    <span className="ml-1.5 text-[10.5px] font-medium text-[#1E40AF]">
                      new
                    </span>
                  )}
                </span>
                {stop.otherRouteCount > 0 && (
                  <span
                    title={`Also served by ${stop.otherRouteCount} other route${stop.otherRouteCount === 1 ? "" : "s"}`}
                    className="shrink-0 rounded-full bg-[#F1F3F4] px-1.5 py-0.5 text-[10.5px] font-medium text-[#5C6B5E]"
                  >
                    +{stop.otherRouteCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(stop.id);
                    setDraftName(stop.name);
                  }}
                  className="shrink-0 cursor-pointer text-[11.5px] font-semibold text-[#5C6B5E] hover:text-[#1C2321]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isPending || stop.otherRouteCount > 0}
                  title={
                    stop.otherRouteCount > 0
                      ? `Served by ${stop.otherRouteCount} other route${stop.otherRouteCount === 1 ? "" : "s"} — removing it would shorten them too`
                      : "Delete this stop"
                  }
                  onClick={() => submitDelete(stop)}
                  className="shrink-0 cursor-pointer px-1 text-[13px] font-semibold text-[#B91C1C] hover:text-[#7F1D1D] disabled:cursor-not-allowed disabled:text-[#D6DCD0]"
                >
                  ×
                </button>
              </>
            )}
          </li>
        ))}
        {stops.length === 0 && (
          <li className="py-3 text-center text-[12.5px] text-[#7E9182]">
            No stops on this direction.
          </li>
        )}
      </ol>
    </div>
  );
}
