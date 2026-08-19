"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import type { FilterSpecification } from "maplibre-gl";
import { applyRouteHoverTransitions } from "@/components/map/map-style";
import type { StopSearchResult } from "@/components/map/types";
import type { NetworkRoute } from "@/components/console/network-map";

/**
 * Hover preview for the console map: highlight the line under the cursor and
 * show its stops, mirroring the public map so operators get the same feel.
 *
 * Lifted out of `network-map.tsx`, which had grown well past the complexity
 * limit — this was eight branches that had nothing to do with the rest of the
 * component. Suppressed entirely while drawing: previewing another route's
 * stops mid-draw is noise, and it would fetch on every mouse move.
 */

// Module-level so it persists across renders without a ref read during render.
const hoverStopCache = new Map<string, StopSearchResult[]>();

interface RouteHover {
  /** The route being previewed, or null. */
  route: NetworkRoute | null;
  /** Its id, for the highlight layers. */
  routeId: string | null;
  stops: StopSearchResult[];
  filter: FilterSpecification;
  onMouseMove: (event: MapLayerMouseEvent) => void;
  onMouseLeave: () => void;
}

export function useRouteHover(
  mapRef: RefObject<MapRef | null>,
  routeById: Map<string, NetworkRoute>,
  selectedRouteId: string | null,
  isOperatorVisible: (code: NetworkRoute["operatorCode"]) => boolean,
  /** While drawing, the cursor and the map belong to the drawing. */
  drawing: boolean,
): RouteHover {
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [fetchedStops, setFetchedStops] = useState<{
    routeId: string;
    stops: StopSearchResult[];
  } | null>(null);

  // Only highlight while it isn't the selected route and its agency is visible.
  const hovered = hoveredRouteId ? routeById.get(hoveredRouteId) : undefined;
  const effective =
    hoveredRouteId &&
    hoveredRouteId !== selectedRouteId &&
    isOperatorVisible(hovered?.operatorCode ?? null)
      ? hoveredRouteId
      : null;

  // Derived (not stored) so there's no synchronous setState on hover-out.
  const cached = effective ? hoverStopCache.get(effective) : undefined;
  const fetched =
    effective && fetchedStops?.routeId === effective ? fetchedStops.stops : [];
  const stops = effective ? (cached ?? fetched) : [];

  const onMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      const canvas = mapRef.current?.getCanvas();

      if (drawing) {
        if (canvas) canvas.style.cursor = "crosshair";
        setHoveredRouteId(null);
        return;
      }

      const feature = event.features?.find((f) =>
        isOperatorVisible(
          (f.properties?.operatorCode as NetworkRoute["operatorCode"]) ?? null,
        ),
      );
      const routeId = (feature?.properties?.routeId as string) ?? null;
      if (canvas) canvas.style.cursor = routeId ? "pointer" : "";
      setHoveredRouteId(routeId);
    },
    [mapRef, drawing, isOperatorVisible],
  );

  const onMouseLeave = useCallback(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = "";
    setHoveredRouteId(null);
  }, [mapRef]);

  // Fetch the hovered route's stops (cached). setState only in the async
  // callback — the visible list is derived above, so no clear-effect needed.
  useEffect(() => {
    if (!effective || hoverStopCache.has(effective)) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      void fetch(`/api/routes/${effective}/hover`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { stops?: StopSearchResult[] } | null) => {
          if (cancelled || !data?.stops) return;
          hoverStopCache.set(effective, data.stops);
          setFetchedStops({ routeId: effective, stops: data.stops });
        })
        .catch(() => {});
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [effective]);

  // Smooth width/opacity transitions on the hover layers.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => applyRouteHoverTransitions(map);
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [effective, mapRef]);

  return {
    route: effective ? (routeById.get(effective) ?? null) : null,
    routeId: effective,
    stops,
    filter: ["==", ["get", "routeId"], effective ?? ""],
    onMouseMove,
    onMouseLeave,
  };
}
