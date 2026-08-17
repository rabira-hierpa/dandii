"use client";

import { RouteDetailsTab } from "@/components/console/route-details-tab";
import type { NetworkRoute } from "@/components/console/network-map";
import { RouteServiceTab } from "@/components/console/route-service-tab";
import { RouteShapesTab } from "@/components/console/route-shapes-tab";
import { RouteStopsTab } from "@/components/console/route-stops-tab";
import { RouteTripsTab } from "@/components/console/route-trips-tab";
import { useRouteEditorStore } from "@/stores/route-editor-store";

interface RouteTabBodyProps {
  readonly route: NetworkRoute;
  readonly isMaintainer: boolean;
  readonly canDraw: boolean;
  readonly onChanged: () => void;
}

/**
 * Whichever editor tab is open.
 *
 * Extracted from the map component, which was carrying the branch for every tab
 * inline and had drifted well past the complexity limit. The map's job is the
 * map; deciding which editor is on screen is a separate one.
 */
export function RouteTabBody({
  route,
  isMaintainer,
  canDraw,
  onChanged,
}: RouteTabBodyProps) {
  const activeTab = useRouteEditorStore((s) => s.activeTab);
  const detail = useRouteEditorStore((s) => s.detail);
  const loading = useRouteEditorStore((s) => s.detailLoading);

  // Service reads the route row rather than the editor payload, so it is the
  // one tab that has something to show while the detail is still in flight.
  if (activeTab === "service") {
    return (
      <RouteServiceTab
        route={route}
        isMaintainer={isMaintainer}
        onChanged={onChanged}
      />
    );
  }

  if (loading) {
    return <div className="py-3 text-[12.5px] text-[#5C6B5E]">Loading…</div>;
  }

  // A failed detail fetch used to render nothing at all: four of the five tabs
  // went blank with no message and no way back, which reads as "the editor is
  // broken" rather than "one request failed". Say so, and offer the retry.
  if (!detail) {
    return (
      <div className="flex flex-col items-start gap-2 py-3">
        <p className="text-[12.5px] text-[#B91C1C]">
          Couldn&apos;t load this route&apos;s details.
        </p>
        <button
          type="button"
          onClick={onChanged}
          className="min-h-9 cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#5C6B5E] hover:text-[#1C2321]"
        >
          Retry
        </button>
      </div>
    );
  }

  // Keyed on the route id so selecting a different route remounts the tab.
  // Without it the form's useState initialisers keep the first route's values —
  // every field, not just the visible ones.
  switch (activeTab) {
    case "details":
      return (
        <RouteDetailsTab key={detail.id} detail={detail} onChanged={onChanged} />
      );
    case "stops":
      return (
        <RouteStopsTab key={detail.id} detail={detail} onChanged={onChanged} />
      );
    case "trips":
      return <RouteTripsTab detail={detail} onChanged={onChanged} />;
    case "shapes":
      return (
        <RouteShapesTab
          detail={detail}
          onChanged={onChanged}
          canDraw={canDraw}
        />
      );
    default:
      return null;
  }
}
