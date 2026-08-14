"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MapGl, {
  Layer,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { RouteDetailsTab } from "@/components/console/route-details-tab";
import { RouteServiceTab } from "@/components/console/route-service-tab";
import { RouteStopsTab } from "@/components/console/route-stops-tab";
import { RouteTabs } from "@/components/console/route-tabs";
import { RouteTripsTab } from "@/components/console/route-trips-tab";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import type { RouteEditorDetail } from "@/types/console";
import { RouteChip } from "@/components/console/route-chip";
import type { ClosureKind } from "@/lib/closures";
import { LayersPanel } from "@/components/map/layers-panel";
import {
  ADDIS_CENTER,
  applyRouteHoverTransitions,
  BASEMAP_STYLE,
  ROUTE_HOVER_CASING_WIDTH,
  ROUTE_HOVER_LINE_WIDTH,
  ROUTE_LINE_COLOR,
  ROUTE_LINE_WIDTH,
} from "@/components/map/map-style";
import { StopMarkersLayer } from "@/components/map/stop-markers-layer";
import type { StopSearchResult } from "@/components/map/types";
import { ga } from "@/lib/gtag";
import {
  CLOSED_ROUTE_COLOR,
  OPERATOR_CODES,
  OPERATOR_META,
  type ClosureReasonValue,
  type OperatorCode,
} from "@/lib/operators";
import { useMapStore } from "@/stores/map-store";
import { cx } from "@/utils/cx";
import { LayersThree01 } from "@untitledui/icons";

export interface NetworkRoute {
  id: string;
  shortName: string;
  longName: string;
  operatorCode: OperatorCode | null;
  closure: {
    id: string;
    reason: ClosureReasonValue;
    note: string | null;
    endsAt: string;
    kind: ClosureKind;
    fromStopId: string | null;
    toStopId: string | null;
  } | null;
}


function statusLabel(closure: NetworkRoute["closure"]): string {
  if (!closure) return "Open";
  if (closure.kind === "WHOLE_ROUTE") return "Closed";
  return "Partially closed";
}

function statusStyle(closure: NetworkRoute["closure"]): {
  background: string;
  color: string;
} {
  if (!closure) return { background: "#DCFCE7", color: "#166534" };
  if (closure.kind === "WHOLE_ROUTE") {
    return { background: "#FEE2E2", color: "#991B1B" };
  }
  return { background: "#FFEDD5", color: "#9A3412" };
}

interface NetworkMapProps {
  routes: NetworkRoute[];
  isMaintainer: boolean;
}

// Module-level so it persists across renders without a ref read during render.
const hoverStopCache = new Map<string, StopSearchResult[]>();


/**
 * The console asks for both directions — operators edit each line separately,
 * so unlike the rider map this shows the outbound and inbound shapes as
 * distinct features (GTFS-X does the same).
 */
function fetchRouteGeojson() {
  return fetch(`/api/geo/routes?directions=both&t=${Date.now()}`, {
    cache: "no-store",
  }).then((res) => res.json() as Promise<GeoJSON.FeatureCollection>);
}

export function NetworkMap({ routes, isMaintainer }: NetworkMapProps) {
  const mapRef = useRef<MapRef>(null);
  const {
    selectedRouteId,
    setSelectedRouteId,
    hiddenOperators,
    toggleOperator,
    layersOpen,
    setLayersOpen,
  } = useMapStore();
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const [panelSearch, setPanelSearch] = useState("");

  // Hover preview — mirrors the public map so operators get the same feel.
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [fetchedHoverStops, setFetchedHoverStops] = useState<{
    routeId: string;
    stops: StopSearchResult[];
  } | null>(null);


  const activeTab = useRouteEditorStore((s) => s.activeTab);
  const editorDetail = useRouteEditorStore((s) => s.detail);
  const editorLoading = useRouteEditorStore((s) => s.detailLoading);
  const editorFeedback = useRouteEditorStore((s) => s.feedback);
  const editorDirectionId = useRouteEditorStore((s) => s.directionId);
  const focusedStop = useRouteEditorStore((s) => s.focusedStop);
  const setEditorDetail = useRouteEditorStore((s) => s.setDetail);
  const setEditorLoading = useRouteEditorStore((s) => s.setDetailLoading);
  const resetEditor = useRouteEditorStore((s) => s.resetForRoute);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  const loadGeojson = useCallback(async () => {
    setGeojson(await fetchRouteGeojson());
  }, []);

  /**
   * Re-read the route after an edit. Also refetches the map geometry, because
   * edits change what is drawn — a new colour, a reordered stop list — and
   * router.refresh() can't help: the geojson lives in client state from a
   * fetch, not in a server component.
   */
  const reloadEditorDetail = useCallback(() => {
    setDetailReloadKey((k) => k + 1);
    void loadGeojson();
  }, [loadGeojson]);

  useEffect(() => {
    let cancelled = false;
    void fetchRouteGeojson().then((data) => {
      if (!cancelled) setGeojson(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const routeById = useMemo(
    () => new Map(routes.map((r) => [r.id, r])),
    [routes],
  );
  const selected = selectedRouteId ? routeById.get(selectedRouteId) : null;
  const closedRoutes = routes.filter((r) => r.closure);
  const fullyClosed = closedRoutes.filter(
    (r) => r.closure?.kind === "WHOLE_ROUTE",
  );
  const partialClosed = closedRoutes.filter(
    (r) => r.closure?.kind !== "WHOLE_ROUTE",
  );


  // Editor payload for the selected route (tabs read this).
  useEffect(() => {
    if (!selectedRouteId) {
      resetEditor();
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setEditorLoading(true);
    });
    void fetch(`/api/console/routes/${selectedRouteId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RouteEditorDetail | null) => {
        if (!cancelled) setEditorDetail(data);
      })
      .catch(() => {
        if (!cancelled) setEditorDetail(null);
      })
      .finally(() => {
        if (!cancelled) setEditorLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedRouteId,
    detailReloadKey,
    resetEditor,
    setEditorDetail,
    setEditorLoading,
  ]);

  /**
   * Stops of the selected route, for the direction the Stops tab is showing.
   * Selecting a route puts its calls on the map — an operator editing a stop
   * list needs to see where those stops actually are.
   */
  const selectedStops: StopSearchResult[] = useMemo(() => {
    if (!editorDetail) return [];
    const rows = editorDetail.stopsByDirection[editorDirectionId] ?? [];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.lat,
      lon: r.lon,
    }));
  }, [editorDetail, editorDirectionId]);

  // Fly to a stop the operator clicked in the Stops tab.
  useEffect(() => {
    if (!focusedStop) return;
    mapRef.current?.getMap().flyTo({
      center: [focusedStop.lon, focusedStop.lat],
      zoom: 16,
      duration: 700,
    });
  }, [focusedStop]);



  const isOperatorVisible = useCallback(
    (code: OperatorCode | null) => !code || !hiddenOperators.includes(code),
    [hiddenOperators],
  );

  const panelRoutes = useMemo(() => {
    const q = panelSearch.trim().toLowerCase();
    const visible = routes.filter((r) => isOperatorVisible(r.operatorCode));
    const source = q
      ? visible.filter(
          (r) =>
            r.shortName.toLowerCase().includes(q) ||
            r.longName.toLowerCase().includes(q),
        )
      : visible.filter((r) => r.closure);
    return source.slice(0, 30);
  }, [panelSearch, routes, isOperatorVisible]);

  const visibleCodes = useMemo(
    () => [
      ...OPERATOR_CODES.filter((code) => !hiddenOperators.includes(code)),
      "UNKNOWN",
    ],
    [hiddenOperators],
  );

  /** Fade hidden agencies (same behavior as the public map). */
  const routeOpacity = useMemo(
    () =>
      [
        "case",
        [
          "in",
          ["coalesce", ["get", "operatorCode"], "UNKNOWN"],
          ["literal", visibleCodes],
        ],
        0.75,
        0,
      ] as unknown as number,
    [visibleCodes],
  );

  const closedRouteOpacity = useMemo(
    () =>
      [
        "case",
        [
          "in",
          ["coalesce", ["get", "operatorCode"], "UNKNOWN"],
          ["literal", visibleCodes],
        ],
        0.9,
        0,
      ] as unknown as number,
    [visibleCodes],
  );

  const onMapClick = (event: MapLayerMouseEvent) => {
    // Opacity-0 lines stay hit-testable — skip hidden agencies (same as public map).
    const feature = event.features?.find((f) =>
      isOperatorVisible(
        (f.properties?.operatorCode as OperatorCode | null) ?? null,
      ),
    );
    const routeId = feature ? (feature.properties.routeId as string) : null;
    if (routeId) ga.consoleSelectRoute(routeId);
    setSelectedRouteId(routeId);
  };

  // A hovered route is only highlighted while it isn't the selected one,
  // and while its agency layer is still visible.
  const effectiveHover =
    hoveredRouteId &&
    hoveredRouteId !== selectedRouteId &&
    isOperatorVisible(routeById.get(hoveredRouteId)?.operatorCode ?? null)
      ? hoveredRouteId
      : null;
  const hoveredRoute = effectiveHover ? routeById.get(effectiveHover) : null;
  // Derived (not stored) so there's no synchronous setState on hover-out.
  const hoverStops: StopSearchResult[] = effectiveHover
    ? (hoverStopCache.get(effectiveHover) ??
      (fetchedHoverStops?.routeId === effectiveHover
        ? fetchedHoverStops.stops
        : []))
    : [];

  const onMouseMove = (event: MapLayerMouseEvent) => {
    const feature = event.features?.find((f) =>
      isOperatorVisible(
        (f.properties?.operatorCode as OperatorCode | null) ?? null,
      ),
    );
    const routeId = feature?.properties?.routeId as string | undefined;
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = routeId ? "pointer" : "";
    setHoveredRouteId(routeId ?? null);
  };

  const onMouseLeave = () => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = "";
    setHoveredRouteId(null);
  };

  const hoverFilter: FilterSpecification = [
    "==",
    ["get", "routeId"],
    effectiveHover ?? "",
  ];

  // Fetch the hovered route's stops (cached). setState only in the async
  // callback — the visible list is derived above, so no clear-effect needed.
  useEffect(() => {
    if (!effectiveHover || hoverStopCache.has(effectiveHover)) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      void fetch(`/api/routes/${effectiveHover}/hover`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { stops?: StopSearchResult[] } | null) => {
          if (cancelled || !data?.stops) return;
          hoverStopCache.set(effectiveHover, data.stops);
          setFetchedHoverStops({ routeId: effectiveHover, stops: data.stops });
        })
        .catch(() => {});
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [effectiveHover]);

  // Smooth width/opacity transitions on the hover layers.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const apply = () => applyRouteHoverTransitions(map);
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [effectiveHover]);






  return (
    <div className="flex items-start gap-4 max-xl:flex-col">
      <div className="flex w-90 shrink-0 flex-col gap-3 max-xl:w-full">

        {selected ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[#E2E6DE] bg-white p-4">
            <div className="flex items-center gap-2">
              <RouteChip
                shortName={selected.shortName}
                operatorCode={selected.operatorCode}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1C2321]">
                {selected.longName}
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={statusStyle(selected.closure)}
              >
                {statusLabel(selected.closure)}
              </span>
            </div>

            <RouteTabs
              stopCount={
                editorDetail
                  ? (editorDetail.stopsByDirection[0]?.length ?? null)
                  : null
              }
              tripCount={
                editorDetail
                  ? editorDetail.directions.reduce(
                      (n, d) => n + d.tripCount,
                      0,
                    )
                  : null
              }
            />

            {editorFeedback && (
              <div
                className={cx(
                  "rounded-lg px-3 py-2 text-[12.5px]",
                  editorFeedback.kind === "error"
                    ? "bg-[#FEF2F2] text-[#B91C1C]"
                    : "bg-[#DCFCE7] text-[#15803D]",
                )}
              >
                {editorFeedback.message}
              </div>
            )}

            {activeTab !== "service" && editorLoading && (
              <div className="py-3 text-[12.5px] text-[#5C6B5E]">Loading…</div>
            )}

            {/* Keyed on the route id so selecting a different route remounts the
                tab. Without it the form's useState initialisers keep the first
                route's values — every field, not just the visible ones. */}
            {activeTab === "details" && editorDetail && (
              <RouteDetailsTab
                key={editorDetail.id}
                detail={editorDetail}
                onChanged={reloadEditorDetail}
              />
            )}

            {activeTab === "stops" && editorDetail && (
              <RouteStopsTab
                key={editorDetail.id}
                detail={editorDetail}
                onChanged={reloadEditorDetail}
              />
            )}

            {activeTab === "trips" && editorDetail && (
              <RouteTripsTab detail={editorDetail} />
            )}

            {activeTab === "service" && (
              <RouteServiceTab
                route={selected}
                isMaintainer={isMaintainer}
                onChanged={reloadEditorDetail}
              />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-[#E2E6DE] bg-white p-4 text-[13px] text-[#5C6B5E]">
            Select a route on the map — or search below — to open or close it.
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-xl border border-[#E2E6DE] bg-white p-4">
          <input
            value={panelSearch}
            onChange={(e) => setPanelSearch(e.target.value)}
            placeholder="Search routes…"
            className="rounded-lg border border-[#D6DCD0] bg-white px-3 py-2 text-[13px] text-[#1C2321]"
          />
          <div className="text-[11.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
            {panelSearch.trim() ? "Search results" : "Currently closed"}
          </div>
          <div className="flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto">
            {panelRoutes.map((route) => (
              <button
                key={route.id}
                onClick={() => {
                  ga.consoleSelectRoute(route.id);
                  setSelectedRouteId(route.id);
                }}
                className={cx(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left",
                  selectedRouteId === route.id
                    ? "border-[#86B98F] bg-[#F3F8F1]"
                    : "border-[#E2E6DE] bg-white hover:bg-[#F8FAF6]",
                )}
              >
                <RouteChip
                  shortName={route.shortName}
                  operatorCode={route.operatorCode}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#1C2321]">
                  {route.longName}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={statusStyle(route.closure)}
                >
                  {statusLabel(route.closure)}
                </span>
              </button>
            ))}
            {panelRoutes.length === 0 && (
              <div className="py-3 text-center text-[12.5px] text-[#7E9182]">
                {panelSearch.trim()
                  ? "No routes match."
                  : "All routes are open."}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-[1_1_620px] rounded-xl border border-[#E2E6DE] bg-white p-4 max-xl:w-full">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          {Object.values(OPERATOR_META).map((meta) => {
            const visible = !hiddenOperators.includes(meta.code);
            return (
              <button
                key={meta.code}
                type="button"
                onClick={() => {
                  ga.toggleLayer(meta.code, !visible);
                  toggleOperator(meta.code);
                }}
                aria-pressed={visible}
                title={
                  visible
                    ? `Hide ${meta.short} on the map`
                    : `Show ${meta.short} on the map`
                }
                className={cx(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors",
                  visible
                    ? "border-[#D6DCD0] text-[#5C6B5E] hover:bg-[#F4F5F2]"
                    : "border-[#E8EBE6] text-[#BDC1C6] line-through",
                )}
              >
                <span
                  className="h-1 w-4.5 rounded-sm"
                  style={{ background: meta.color }}
                />
                {meta.short}
              </button>
            );
          })}
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#5C6B5E]">
            <span
              className="h-1 w-4.5 rounded-sm"
              style={{
                background: `repeating-linear-gradient(90deg, ${CLOSED_ROUTE_COLOR} 0 4px, transparent 4px 7px)`,
              }}
            />
            Closed
          </span>
          <span className="ml-auto text-xs text-[#5C6B5E]">
            {routes.length - closedRoutes.length} open · {fullyClosed.length}{" "}
            closed · {partialClosed.length} partial
          </span>
        </div>

        <div className="relative h-[90vh] min-h-100 overflow-hidden rounded-lg">
          <button
            type="button"
            aria-label="Transit layers"
            aria-pressed={layersOpen}
            onClick={() => setLayersOpen(!layersOpen)}
            className="absolute bottom-4 left-4 z-20 flex size-11 cursor-pointer items-center justify-center rounded-full bg-white text-[#5C6B5E] shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:text-[#1C2321] active:scale-95"
          >
            <LayersThree01 className="size-5.5" />
          </button>
          <LayersPanel />
          {hoveredRoute && (
            <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 flex max-w-[80%] items-center gap-2 rounded-lg border border-[#E2E6DE] bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur">
              <RouteChip
                shortName={hoveredRoute.shortName}
                operatorCode={hoveredRoute.operatorCode}
                size="sm"
              />
              <span className="min-w-0 truncate text-[12.5px] font-medium text-[#1C2321]">
                {hoveredRoute.longName}
              </span>
              {hoveredRoute.closure && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={statusStyle(hoveredRoute.closure)}
                >
                  {statusLabel(hoveredRoute.closure)}
                </span>
              )}
            </div>
          )}
          <MapGl
            ref={mapRef}
            initialViewState={{ ...ADDIS_CENTER, zoom: 11 }}
            mapStyle={BASEMAP_STYLE}
            canvasContextAttributes={{ preserveDrawingBuffer: true }}
            interactiveLayerIds={["routes-open", "routes-closed"]}
            onClick={onMapClick}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            style={{ width: "100%", height: "100%" }}
          >
            {geojson && (
              <Source id="routes" type="geojson" data={geojson}>
                <Layer
                  id="routes-open"
                  type="line"
                  filter={["!=", ["get", "closed"], true]}
                  layout={{ "line-cap": "round", "line-join": "round" }}
                  paint={{
                    "line-color": ROUTE_LINE_COLOR,
                    "line-width": ROUTE_LINE_WIDTH,
                    "line-opacity": routeOpacity,
                    "line-opacity-transition": { duration: 350, delay: 0 },
                  }}
                />
                <Layer
                  id="routes-closed"
                  type="line"
                  filter={["==", ["get", "closed"], true]}
                  paint={{
                    "line-color": CLOSED_ROUTE_COLOR,
                    "line-width": ROUTE_LINE_WIDTH,
                    "line-opacity": closedRouteOpacity,
                    "line-opacity-transition": { duration: 350, delay: 0 },
                    "line-dasharray": [2, 1.5],
                  }}
                />
                {effectiveHover && (
                  <Layer
                    id="routes-hover-casing"
                    type="line"
                    filter={hoverFilter}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": "#FFFFFF",
                      "line-width": ROUTE_HOVER_CASING_WIDTH,
                      "line-opacity": 0.95,
                    }}
                  />
                )}
                {effectiveHover && (
                  <Layer
                    id="routes-hover-line"
                    type="line"
                    filter={hoverFilter}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": ROUTE_LINE_COLOR,
                      "line-width": ROUTE_HOVER_LINE_WIDTH,
                      "line-opacity": 1,
                    }}
                  />
                )}
                {selectedRouteId && (
                  <Layer
                    id="routes-selected-open"
                    type="line"
                    filter={[
                      "all",
                      ["==", ["get", "routeId"], selectedRouteId],
                      ["!=", ["get", "closed"], true],
                    ]}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": "#1C2321",
                      "line-width": 5,
                      "line-opacity": 0.9,
                    }}
                  />
                )}
                {selectedRouteId && (
                  <Layer
                    id="routes-selected-closed"
                    type="line"
                    filter={[
                      "all",
                      ["==", ["get", "routeId"], selectedRouteId],
                      ["==", ["get", "closed"], true],
                    ]}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": CLOSED_ROUTE_COLOR,
                      "line-width": 5,
                      "line-opacity": 0.95,
                      "line-dasharray": [2, 1.5],
                    }}
                  />
                )}
              </Source>
            )}

            <StopMarkersLayer
              id="hover-stops"
              stops={hoverStops}
              variant="route"
              visible={Boolean(
                effectiveHover && hoverStops.length && !selectedRouteId,
              )}
              onLine
            />
            <StopMarkersLayer
              id="selected-route-stops"
              stops={selectedStops}
              variant="route"
              visible={selectedStops.length > 0}
              onLine
            />
          </MapGl>
        </div>
        <div className="mt-2 text-[11.5px] text-[#7E9182]">
          Click a route line to select it, then manage its closure in the
          service panel
        </div>
      </div>
    </div>
  );
}
