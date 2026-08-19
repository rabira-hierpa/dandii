"use client";

import { useEffect } from "react";
import { MAX_WAYPOINTS } from "@/actions/shape-edit-schema";
import {
  unsnappedCount,
  useShapeDrawStore,
} from "@/stores/shape-draw-store";
import { cx } from "@/utils/cx";

interface ShapeDrawToolbarProps {
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

/**
 * Draw-mode chrome: what you are drawing, how it is going, and the way out.
 *
 * The banner sits where the hover card sits in normal mode — the two are
 * mutually exclusive, since hover is suppressed while drawing — so the map
 * gains no new furniture. Actions go bottom-right, clear of the Layers button.
 *
 * The unsnapped count is spelled out rather than left to the dashes. A dash is
 * legible once you know what it means; a number tells you before you do.
 */
export function ShapeDrawToolbar({ onSave, onCancel }: ShapeDrawToolbarProps) {
  const target = useShapeDrawStore((s) => s.target);
  const waypoints = useShapeDrawStore((s) => s.waypoints);
  const segments = useShapeDrawStore((s) => s.segments);
  const snapping = useShapeDrawStore((s) => s.snapping);
  const snapError = useShapeDrawStore((s) => s.snapError);
  const saving = useShapeDrawStore((s) => s.saving);
  const undo = useShapeDrawStore((s) => s.undo);

  // Cmd/Ctrl+Z to take back a misplaced point; Escape to leave. Without these a
  // single misclick costs the whole line.
  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onCancel, undo]);

  if (!target) return null;

  const unsnapped = unsnappedCount(segments);
  const allUnsnapped = segments.length > 1 && unsnapped === segments.length;
  const canSave = waypoints.length >= 2 && !saving;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute top-2.5 left-2.5 z-20 flex max-w-[80%] flex-col gap-0.5 rounded-lg border border-[#E2E6DE] bg-white/95 px-3 py-2 shadow-sm backdrop-blur"
      >
        <span className="text-[12.5px] font-semibold text-[#1C2321]">
          Drawing {target.label}
        </span>
        <span className="text-[11.5px] text-[#5C6B5E]">
          {waypoints.length === 0
            ? "Click the map to place your first point"
            : `${waypoints.length} point${waypoints.length === 1 ? "" : "s"}`}
          {snapping && " · snapping…"}
          {waypoints.length >= MAX_WAYPOINTS && ` · ${MAX_WAYPOINTS} is the limit`}
        </span>
        {allUnsnapped ? (
          <span className="text-[11.5px] font-medium text-[#B45309]">
            Road snapping is unavailable — the line will be saved as drawn
          </span>
        ) : (
          unsnapped > 0 && (
            <span className="text-[11.5px] font-medium text-[#B45309]">
              {unsnapped} of {segments.length} segments couldn&apos;t be snapped
              to a road
            </span>
          )
        )}
        {snapError && (
          <span className="text-[11.5px] text-[#B91C1C]">{snapError}</span>
        )}
      </div>

      <div className="absolute right-4 bottom-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={waypoints.length === 0}
          className="min-h-11 cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#5C6B5E] shadow-sm hover:text-[#1C2321] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#5C6B5E] shadow-sm hover:text-[#1C2321]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={cx(
            "min-h-11 cursor-pointer rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-sm",
            canSave
              ? "bg-[#15803D] hover:bg-[#166534]"
              : "cursor-not-allowed bg-[#9FBFA8]",
          )}
        >
          {saving ? "Saving…" : "Save shape"}
        </button>
      </div>
    </>
  );
}
