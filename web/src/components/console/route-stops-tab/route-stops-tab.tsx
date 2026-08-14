"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  createStop,
  deleteStop,
  renameStop,
  reorderRouteStops,
} from "@/actions/stop-edit";
import { SortableStopRow } from "@/components/console/sortable-stop-row";
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

  const direction = detail.directions.find(
    (d) => d.directionId === directionId,
  );

  // Optimistic order so a drag lands instantly instead of waiting for the round
  // trip. Cleared whenever the server data changes, which is what makes a
  // rejected reorder snap back to the truth rather than lie about having saved.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const stops = useMemo(() => {
    // Indexed inside the memo: `?? []` allocates a fresh array every render, so
    // hoisting it would make the dependency change on each pass and defeat the
    // memo entirely.
    const serverStops = detail.stopsByDirection[directionId] ?? [];
    if (!dragOrder) return serverStops;
    const byId = new Map(serverStops.map((s) => [s.id, s]));
    const ordered = dragOrder
      .map((id) => byId.get(id))
      .filter((s): s is RouteStopRow => s !== undefined);
    return ordered.length === serverStops.length ? ordered : serverStops;
  }, [dragOrder, detail.stopsByDirection, directionId]);

  const sensors = useSensors(
    // 6px so a click on Edit/× isn't swallowed as a micro-drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = stops.findIndex((s) => s.id === active.id);
    const to = stops.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;

    const next = arrayMove(stops, from, to).map((s) => s.id);
    setDragOrder(next);
    setFeedback(null);
    startTransition(async () => {
      const result = await reorderRouteStops({
        routeId: detail.id,
        directionId,
        stopIds: next,
      });
      if (result.ok) {
        setFeedback({ kind: "ok", message: "Stop order saved" });
        setDragOrder(null);
        refresh();
      } else {
        setDragOrder(null); // snap back — the list on screen was not saved
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={stops.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto">
            {stops.map((stop, i) => (
              <SortableStopRow
                key={stop.id}
                stop={stop}
                position={i + 1}
                editing={editingId === stop.id}
                draftName={draftName}
                disabled={isPending}
                onDraftChange={setDraftName}
                onStartEdit={() => {
                  setEditingId(stop.id);
                  setDraftName(stop.name);
                }}
                onCommitEdit={() => submitRename(stop)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => submitDelete(stop)}
              />
            ))}
            {stops.length === 0 && (
              <li className="py-3 text-center text-[12.5px] text-[#7E9182]">
                No stops on this direction.
              </li>
            )}
          </ol>
        </SortableContext>
      </DndContext>

      {stops.length > 1 && (
        <p className="text-[11px] text-[#7E9182]">
          Drag the handle to reorder. Times stay with the position, not the stop
          — a run reaches its 5th call at the same time whichever stop that is.
        </p>
      )}
    </div>
  );
}
