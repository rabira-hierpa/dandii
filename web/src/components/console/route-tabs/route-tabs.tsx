"use client";

import { useRouteEditorStore } from "@/stores/route-editor-store";
import type { RouteEditorTab } from "@/types/console";
import { cx } from "@/utils/cx";

interface RouteTabsProps {
  /** Counts shown beside a label, GTFS-X style ("Stops 27"). */
  readonly stopCount: number | null;
  readonly tripCount: number | null;
}

const TABS: { id: RouteEditorTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "stops", label: "Stops" },
  { id: "trips", label: "Trips" },
  { id: "shapes", label: "Shapes" },
  { id: "service", label: "Service" },
];

export function RouteTabs({ stopCount, tripCount }: RouteTabsProps) {
  const activeTab = useRouteEditorStore((s) => s.activeTab);
  const setActiveTab = useRouteEditorStore((s) => s.setActiveTab);

  const countFor = (id: RouteEditorTab): number | null => {
    if (id === "stops") return stopCount;
    if (id === "trips") return tripCount;
    return null;
  };

  return (
    <div
      role="tablist"
      aria-label="Route editor"
      className="flex gap-1 border-b border-[#E2E6DE]"
    >
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        const count = countFor(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "-mb-px cursor-pointer border-b-2 px-2.5 py-2 text-[12.5px] font-semibold transition-colors",
              active
                ? "border-[#B45309] text-[#B45309]"
                : "border-transparent text-[#5C6B5E] hover:text-[#1C2321]",
            )}
          >
            {tab.label}
            {count !== null && (
              <span
                className={cx(
                  "ml-1.5 text-[11px] font-medium",
                  active ? "text-[#B45309]" : "text-[#8A9A8C]",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
