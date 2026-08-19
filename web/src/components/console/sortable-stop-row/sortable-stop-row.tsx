"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RouteStopRow } from "@/types/console";
import { cx } from "@/utils/cx";

interface SortableStopRowProps {
  readonly stop: RouteStopRow;
  readonly position: number;
  readonly editing: boolean;
  readonly draftName: string;
  readonly draftNameAm: string;
  readonly disabled: boolean;
  readonly onDraftChange: (name: string) => void;
  readonly onDraftAmChange: (nameAm: string) => void;
  readonly onStartEdit: () => void;
  readonly onCommitEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onDelete: () => void;
  readonly onFocusOnMap: () => void;
}

const inputClass =
  "rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-1 text-[13px] font-normal text-[#1C2321]";

export function SortableStopRow({
  stop,
  position,
  editing,
  draftName,
  draftNameAm,
  disabled,
  onDraftChange,
  onDraftAmChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
  onFocusOnMap,
}: SortableStopRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id, disabled: editing });

  const blocked = stop.otherRouteCount > 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5",
        isDragging
          ? "z-10 border-[#B45309] shadow-md"
          : "border-[#E2E6DE]",
      )}
    >
      {/* Grip is the only drag handle: making the whole row draggable would
          swallow the click that starts a rename. */}
      <button
        type="button"
        aria-label={`Reorder ${stop.name}`}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none px-0.5 text-[#B6BFB3] hover:text-[#5C6B5E] active:cursor-grabbing"
      >
        ⠿
      </button>
      <span className="w-5 shrink-0 text-right text-[11px] font-medium text-[#8A9A8C]">
        {position}
      </span>

      {editing ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              value={draftName}
              autoFocus
              placeholder="Stop name"
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              className={inputClass}
            />
            <input
              value={draftNameAm}
              placeholder="Amharic name (optional)"
              lang="am"
              onChange={(e) => onDraftAmChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={onCommitEdit}
            className="shrink-0 cursor-pointer text-[11.5px] font-semibold text-[#15803D] hover:text-[#166534]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="shrink-0 cursor-pointer text-[11.5px] font-semibold text-[#5C6B5E] hover:text-[#1C2321]"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onFocusOnMap}
            title="Show this stop on the map"
            className="flex min-w-0 flex-1 flex-col items-start truncate text-left"
          >
            <span className="truncate text-[12.5px] text-[#1C2321] hover:text-[#B45309] hover:underline">
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
            {stop.nameAm && (
              <span lang="am" className="truncate text-[11px] text-[#7E9182]">
                {stop.nameAm}
              </span>
            )}
          </button>
          {blocked && (
            <span
              title={`Also served by ${stop.otherRouteCount} other route${stop.otherRouteCount === 1 ? "" : "s"}`}
              className="shrink-0 rounded-full bg-[#F1F3F4] px-1.5 py-0.5 text-[10.5px] font-medium text-[#5C6B5E]"
            >
              +{stop.otherRouteCount}
            </span>
          )}
          <button
            type="button"
            onClick={onStartEdit}
            className="shrink-0 cursor-pointer text-[11.5px] font-semibold text-[#5C6B5E] hover:text-[#1C2321]"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={disabled || blocked}
            title={
              blocked
                ? `Served by ${stop.otherRouteCount} other route${stop.otherRouteCount === 1 ? "" : "s"} — removing it would shorten them too`
                : "Delete this stop"
            }
            onClick={onDelete}
            className="shrink-0 cursor-pointer px-1 text-[13px] font-semibold text-[#B91C1C] hover:text-[#7F1D1D] disabled:cursor-not-allowed disabled:text-[#D6DCD0]"
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}
