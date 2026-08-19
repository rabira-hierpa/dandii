"use client";

import { useTransition } from "react";
import { resetRouteShape } from "@/actions/shape-edit";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import { useShapeDrawStore } from "@/stores/shape-draw-store";
import type { RouteDirection, RouteEditorDetail } from "@/types/console";
import { cx } from "@/utils/cx";

interface RouteShapesTabProps {
  readonly detail: RouteEditorDetail;
  readonly onChanged: () => void;
  /** Draw mode is a map interaction, so it needs room the console lacks below xl. */
  readonly canDraw: boolean;
}

/** "Outbound → Megenagna", or just "Outbound" when the feed has no headsign. */
export function directionLabel(direction: RouteDirection): string {
  const side = direction.directionId === 0 ? "Outbound" : "Inbound";
  return direction.headsign ? `${side} → ${direction.headsign}` : side;
}

/**
 * The home for shape editing.
 *
 * Right-clicking a line on the map is the shortcut, but it cannot be the only
 * way in: the console map draws a direction only when one of its trips carries
 * a shape id, so a route created in the console has no line to right-click —
 * exactly the route that most needs one drawn. This tab is reachable whether or
 * not any geometry exists.
 */
export function RouteShapesTab({
  detail,
  onChanged,
  canDraw,
}: RouteShapesTabProps) {
  const setFeedback = useRouteEditorStore((s) => s.setFeedback);
  const begin = useShapeDrawStore((s) => s.begin);
  const [isPending, startTransition] = useTransition();

  const onDraw = (direction: RouteDirection) => {
    begin({
      routeId: detail.id,
      directionId: direction.directionId,
      label: directionLabel(direction),
      // Reopen the operator's own points, not the snapped vertices they made.
      waypoints: direction.shapeOverride?.waypoints,
    });
  };

  const onReset = (direction: RouteDirection) => {
    const label = directionLabel(direction);
    if (
      !window.confirm(
        `Reset ${label} to the feed's own shape? The drawn line will be discarded.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await resetRouteShape({
        routeId: detail.id,
        directionId: direction.directionId,
      });
      if (result.ok) {
        setFeedback({ kind: "ok", message: `${label} reset to the feed shape` });
        onChanged();
      } else {
        setFeedback({ kind: "error", message: result.error });
      }
    });
  };

  if (detail.directions.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-3">
        <p className="text-[12.5px] text-[#5C6B5E]">
          This route has no trips yet, so there&apos;s no direction to draw a
          shape for. Add a trip on the Trips tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      {detail.directions.map((direction) => {
        const edited = direction.shapeOverride;
        const hasGeometry = direction.shapePoints > 0;
        return (
          <div
            key={direction.directionId}
            className="flex flex-col gap-2 rounded-lg border border-[#E2E6DE] bg-white p-3"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#1C2321]">
                {directionLabel(direction)}
              </span>
              {edited && (
                <span className="shrink-0 rounded-full bg-[#FFEDD5] px-2 py-0.5 text-[10.5px] font-semibold text-[#9A3412]">
                  Edited
                </span>
              )}
            </div>

            <div className="text-[11.5px] text-[#5C6B5E]">
              {hasGeometry ? (
                <>
                  {direction.shapePoints} points
                  {edited && (
                    <>
                      {" · "}
                      {edited.waypoints.length} waypoint
                      {edited.waypoints.length === 1 ? "" : "s"}
                      {edited.editedByName && ` · by ${edited.editedByName}`}
                    </>
                  )}
                </>
              ) : (
                "No shape yet — draw one to put this direction on the map."
              )}
            </div>

            {edited && (
              <div className="text-[11px] text-[#7E9182]">
                Live on the rider map · not yet in the exported feed
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onDraw(direction)}
                disabled={!canDraw || isPending}
                title={
                  canDraw ? undefined : "Shape editing needs a wider screen"
                }
                className={cx(
                  "min-h-9 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold",
                  canDraw && !isPending
                    ? "bg-[#15803D] text-white hover:bg-[#166534]"
                    : "cursor-not-allowed bg-[#E8EBE6] text-[#9AA69C]",
                )}
              >
                {edited ? "Redraw" : "Draw"}
              </button>
              {edited && (
                <button
                  type="button"
                  onClick={() => onReset(direction)}
                  disabled={isPending || !edited.canReset}
                  title={
                    edited.canReset
                      ? undefined
                      : "The original geometry wasn't captured for this edit"
                  }
                  className="min-h-9 cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#5C6B5E] hover:text-[#1C2321] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset to feed shape
                </button>
              )}
            </div>

            {!canDraw && (
              <div className="text-[11px] text-[#7E9182]">
                Shape editing needs a wider screen — the map and the editor have
                to be side by side.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
