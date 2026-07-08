"use client";

import { X as CloseX } from "@untitledui/icons";
import { OPERATOR_META, OPERATOR_CODES } from "@/lib/operators";
import { useMapStore } from "@/stores/map-store";
import { cx } from "@/utils/cx";

/**
 * Transit layer toggles, one pill per agency in its brand color.
 * Renders as a bottom overlay on mobile and a floating card on desktop.
 */
export function LayersPanel() {
  const { layersOpen, setLayersOpen, hiddenOperators, toggleOperator } =
    useMapStore();

  if (!layersOpen) return null;

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
        onClick={() => setLayersOpen(false)}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.2)] sm:absolute sm:inset-auto sm:top-16 sm:right-4 sm:bottom-auto sm:w-72 sm:rounded-2xl sm:shadow-xl sm:ring-1 sm:ring-black/5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold text-[#202124]">
              Transit layers
            </div>
            <div className="text-[12px] text-[#5F6368]">
              Show or hide each agency&apos;s network
            </div>
          </div>
          <button
            aria-label="Close layers"
            onClick={() => setLayersOpen(false)}
            className="cursor-pointer rounded-full p-1.5 text-[#5F6368] hover:bg-[#F1F3F4]"
          >
            <CloseX className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {OPERATOR_CODES.map((code) => {
            const meta = OPERATOR_META[code];
            const visible = !hiddenOperators.includes(code);
            return (
              <button
                key={code}
                onClick={() => toggleOperator(code)}
                role="switch"
                aria-checked={visible}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-[#F8F9FA]"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: meta.chipBg }}
                >
                  <span
                    className="h-1.5 w-4 rounded-full"
                    style={{ background: meta.color }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-[#202124]">
                    {meta.short}
                  </span>
                  <span className="block text-[11.5px] text-[#5F6368]">
                    {meta.mode}
                  </span>
                </span>
                {/* Toggle track */}
                <span
                  className={cx(
                    "relative h-5.5 w-9.5 shrink-0 rounded-full transition-colors duration-200",
                  )}
                  style={{ background: visible ? meta.color : "#DADCE0" }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow transition-transform duration-200"
                    style={{
                      transform: visible ? "translateX(16px)" : "translateX(0)",
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
