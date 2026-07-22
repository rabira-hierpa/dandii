"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, type PanInfo } from "motion/react";
import { ChevronLeftDouble, ChevronNextDouble } from "@untitledui/icons";
import { useMapStore, type SheetSnap } from "@/stores/map-store";
import { cx } from "@/utils/cx";

/** Visible sheet height per snap point, as a fraction of the viewport. */
const SNAP_FRACTION: Record<SheetSnap, number> = {
  collapsed: 0.16,
  half: 0.45,
  full: 0.88,
};

const SPRING = { type: "spring" as const, stiffness: 380, damping: 38 };

/**
 * Google-Maps-style draggable bottom sheet with three snap points.
 * On ≥sm screens the same content renders as a fixed floating left panel
 * (Google Maps desktop convention) and dragging is disabled.
 */
export function BottomSheet({
  children,
  desktopHidden = false,
  onCollapse,
  onExpand,
}: {
  children: React.ReactNode;
  /** Hide the desktop panel (user collapsed it via the chevron). */
  desktopHidden?: boolean;
  /** Called when the user clicks the desktop collapse chevron. */
  onCollapse?: () => void;
  /** Called when the user clicks the thin re-open tab while collapsed. */
  onExpand?: () => void;
}) {
  const { sheetSnap, setSheetSnap } = useMapStore();
  const controls = useAnimationControls();
  const [viewportH, setViewportH] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => setViewportH(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const sheetH = viewportH * SNAP_FRACTION.full;
  // y offset from the sheet's fully-expanded position.
  const snapY: Record<SheetSnap, number> = {
    full: 0,
    half: sheetH - viewportH * SNAP_FRACTION.half,
    collapsed: sheetH - viewportH * SNAP_FRACTION.collapsed,
  };

  useEffect(() => {
    if (viewportH === 0) return;
    controls.start({ y: snapY[sheetSnap], transition: SPRING });
    if (sheetSnap !== "full") scrollRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSnap, viewportH]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const current = snapY[sheetSnap] + info.offset.y;
    const projected = current + info.velocity.y * 0.18;
    let nearest: SheetSnap = "collapsed";
    let best = Infinity;
    for (const snap of ["full", "half", "collapsed"] as SheetSnap[]) {
      const d = Math.abs(snapY[snap] - projected);
      if (d < best) {
        best = d;
        nearest = snap;
      }
    }
    setSheetSnap(nearest);
    controls.start({ y: snapY[nearest], transition: SPRING });
  };

  return (
    <>
      {/* Mobile: draggable bottom sheet */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: snapY.collapsed }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        animate={controls}
        initial={false}
        style={{ height: sheetH || "45dvh" }}
        className="fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)] sm:hidden"
      >
        <button
          aria-label={
            sheetSnap === "full" ? "Collapse panel" : "Expand panel"
          }
          onClick={() =>
            setSheetSnap(
              sheetSnap === "collapsed"
                ? "half"
                : sheetSnap === "half"
                  ? "full"
                  : "half",
            )
          }
          className="flex w-full shrink-0 cursor-grab items-center justify-center pt-2.5 pb-1.5 active:cursor-grabbing"
        >
          <span className="h-1 w-9 rounded-full bg-[#DADCE0]" />
        </button>
        <div
          ref={scrollRef}
          className={cx(
            "min-h-0 flex-1 overscroll-contain pb-[env(safe-area-inset-bottom)]",
            sheetSnap === "full"
              ? "touch-pan-y overflow-y-auto"
              : "overflow-hidden",
          )}
        >
          {children}
        </div>
      </motion.div>

      {/* Desktop: floating left panel (Google-Maps style). Collapsible via the
          chevron; when collapsed, a thin re-open tab stays on the left edge. */}
      {desktopHidden ? (
        onExpand && (
          <button
            onClick={onExpand}
            aria-label="Expand panel"
            title="Expand panel"
            className="absolute top-4 left-0 z-30 hidden h-14 w-8 cursor-pointer items-center justify-center rounded-r-xl bg-white text-[#5F6368] shadow-md ring-1 ring-black/10 hover:text-[#202124] sm:flex"
          >
            <ChevronNextDouble className="size-3.5" />
          </button>
        )
      ) : (
        <div className="absolute top-4 left-4 z-30 hidden max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5 sm:flex">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {children}
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              aria-label="Collapse panel"
              title="Collapse panel"
              className="absolute top-1/2 -right-3 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-[#5F6368] shadow-md ring-1 ring-black/10 hover:text-[#202124]"
            >
              <ChevronLeftDouble className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
