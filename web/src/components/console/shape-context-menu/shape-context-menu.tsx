"use client";

import { useEffect, useRef } from "react";
import { useShapeDrawStore } from "@/stores/shape-draw-store";

interface ShapeContextMenuProps {
  /** Label for the direction under the cursor, e.g. "Outbound → Megenagna". */
  readonly directionLabel: string;
  /** Absent when this direction still carries the feed's geometry. */
  readonly canReset: boolean;
  readonly onEditShape: () => void;
  readonly onResetShape: () => void;
}

const MENU_WIDTH = 216;
const MENU_HEIGHT = 96;

/**
 * Right-click menu on a route line.
 *
 * The shortcut, not the front door — the Shapes tab is that, because a route
 * with no line has nothing to right-click. This exists because an operator who
 * is already looking at the line on the map shouldn't have to go find a tab.
 *
 * Keyboard-operable on principle and because CLAUDE.md §10 requires it: arrow
 * keys move, Enter activates, Escape closes and hands focus back.
 */
export function ShapeContextMenu({
  directionLabel,
  canReset,
  onEditShape,
  onResetShape,
}: ShapeContextMenuProps) {
  const menu = useShapeDrawStore((s) => s.contextMenu);
  const close = useShapeDrawStore((s) => s.closeContextMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    ref.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, close]);

  if (!menu) return null;

  // Flip near the container edges so the menu never opens off-screen. The sizes
  // were measured when the click happened, so no layout is read during render.
  const left =
    menu.x + MENU_WIDTH > menu.containerWidth
      ? Math.max(0, menu.x - MENU_WIDTH)
      : menu.x;
  const top =
    menu.y + MENU_HEIGHT > menu.containerHeight
      ? Math.max(0, menu.y - MENU_HEIGHT)
      : menu.y;

  const onItemKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled)",
      ) ?? []),
    ];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Shape actions for ${directionLabel}`}
      onKeyDown={onItemKeyDown}
      style={{ left, top, width: MENU_WIDTH }}
      className="absolute z-30 overflow-hidden rounded-lg border border-[#E2E6DE] bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,0.14)]"
    >
      <div className="truncate px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[#7E9182] uppercase">
        {directionLabel}
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={onEditShape}
        className="w-full cursor-pointer px-3 py-2 text-left text-[12.5px] font-medium text-[#1C2321] hover:bg-[#F3F8F1] focus:bg-[#F3F8F1] focus:outline-none"
      >
        Edit shape
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onResetShape}
        disabled={!canReset}
        title={
          canReset ? undefined : "This direction still has the feed's own shape"
        }
        className="w-full cursor-pointer px-3 py-2 text-left text-[12.5px] font-medium text-[#1C2321] hover:bg-[#F3F8F1] focus:bg-[#F3F8F1] focus:outline-none disabled:cursor-not-allowed disabled:text-[#BDC1C6] disabled:hover:bg-transparent"
      >
        Reset to feed shape
      </button>
    </div>
  );
}
