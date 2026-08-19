"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGl, {
  Layer,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { RouteTabBody } from "@/components/console/route-tab-body";
import { PickedStopLayer } from "@/components/console/picked-stop-layer";
import { RouteTabs } from "@/components/console/route-tabs";
import { ShapeContextMenu } from "@/components/console/shape-context-menu";
import {
  SHAPE_WAYPOINT_LAYER_ID,
  ShapeDrawLayer,
} from "@/components/console/shape-draw-layer";
import { ShapeDrawToolbar } from "@/components/console/shape-draw-toolbar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRouteHover } from "@/hooks/use-route-hover";
import { useShapeDraw } from "@/hooks/use-shape-draw";
import { useShapeDrawController } from "@/hooks/use-shape-draw-controller";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import { useShapeDrawStore } from "@/stores/shape-draw-store";
import { useStopPlacementStore } from "@/stores/stop-placement-store";
import type { RouteEditorDetail } from "@/types/console";
import { RouteChip } from "@/components/console/route-chip";
import type { ClosureKind } from "@/lib/closures";
import { LayersPanel } from "@/components/map/layers-panel";
import {
  ADDIS_CENTER,
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

  const editorDetail = useRouteEditorStore((s) => s.detail);
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

  const routeById = useMemo(
    () => new Map(routes.map((r) => [r.id, r])),
    [routes],
  );

  const isOperatorVisible = useCallback(
    (code: OperatorCode | null) => !code || !hiddenOperators.includes(code),
    [hiddenOperators],
  );

  /** The visible route line under the cursor, if any. */
  const routeUnderCursor = useCallback(
    (event: MapLayerMouseEvent) => {
      // Opacity-0 lines stay hit-testable — skip hidden agencies (same as the
      // public map).
      const feature = event.features?.find((f) =>
        isOperatorVisible(
          (f.properties?.operatorCode as OperatorCode | null) ?? null,
        ),
      );
      const routeId = feature?.properties?.routeId as string | undefined;
      if (!routeId) return null;
      return {
        routeId,
        directionId: Number(feature?.properties?.directionId ?? 0),
      };
    },
    [isOperatorVisible],
  );

  const selectRoute = useCallback(
    (routeId: string) => {
      if (routeId === selectedRouteId) return;
      ga.consoleSelectRoute(routeId);
      setSelectedRouteId(routeId);
    },
    [selectedRouteId, setSelectedRouteId],
  );

  // Shape drawing. `useShapeDraw` keeps the snapped preview in step with the
  // points; the controller owns what each map event means in draw mode, so this
  // component only has to branch on the mode and render.
  const drawWaypointCount = useShapeDrawStore((s) => s.waypoints.length);
  const closeContextMenu = useShapeDrawStore((s) => s.closeContextMenu);
  const contextMenu = useShapeDrawStore((s) => s.contextMenu);
  const resetDraft = useShapeDrawStore((s) => s.resetDraft);
  useShapeDraw();
  const shape = useShapeDrawController(
    editorDetail,
    reloadEditorDetail,
    routeUnderCursor,
    selectRoute,
  );
  const drawing = shape.drawing;

  // The console stacks below xl, which leaves the map too small to draw in.
  const canDraw = useMediaQuery("(min-width: 1280px)");

  // Hover preview — suppressed while drawing.
  const hover = useRouteHover(
    mapRef,
    routeById,
    selectedRouteId,
    isOperatorVisible,
    drawing,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchRouteGeojson().then((data) => {
      if (!cancelled) setGeojson(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = selectedRouteId ? routeById.get(selectedRouteId) : null;
  const closedRoutes = routes.filter((r) => r.closure);
  const fullyClosed = closedRoutes.filter(
    (r) => r.closure?.kind === "WHOLE_ROUTE",
  );
  const partialClosed = closedRoutes.filter(
    (r) => r.closure?.kind !== "WHOLE_ROUTE",
  );

  /**
   * Leaving a route abandons any drawing on it. `resetForRoute` already wipes
   * the editor, so the draw store has to follow or a stale draft would be
   * painted over the next route's line.
   *
   * The draft only — right-clicking an unselected route selects it AND opens the
   * menu, so clearing the menu here would close it in the tick it opened.
   */
  useEffect(() => {
    resetDraft();
  }, [selectedRouteId, resetDraft]);

  // Closing the tab mid-draw loses work the server has never seen.
  useEffect(() => {
    if (!drawing || drawWaypointCount === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [drawing, drawWaypointCount]);

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

  const placing = useStopPlacementStore((st) => st.placing);
  const mapShellRef = useRef<HTMLDivElement>(null);

  // The Stops tab sits above the map in the console's single column, so on a
  // laptop "Pick on map" leaves the operator looking at a form with no map in
  // sight and nothing to click. Bring the map to them.
  useEffect(() => {
    if (!placing) return;
    // Instant, not smooth: the operator pressed a button to go click the map,
    // so an animation is 400ms of not being able to do the thing they asked
    // for. (Smooth is also a no-op in headless Chromium, so this stays
    // verifiable.)
    mapShellRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [placing]);
  const pickPoint = useStopPlacementStore((st) => st.pick);
  const pickedPoint = useStopPlacementStore((st) => st.picked);

  const onMapClick = (event: MapLayerMouseEvent) => {
    if (contextMenu) closeContextMenu();

    // In draw mode a click places a point and nothing else. Falling through to
    // the selection branch would set selectedRouteId to null the moment the
    // operator clicked off a line, which resets the editor and takes the
    // half-finished drawing with it.
    if (drawing) {
      shape.placeWaypoint(event);
      return;
    }

    // Placing a stop, like drawing, consumes the click whole: falling through
    // would also change the route selection and swap the editor out from under
    // the half-filled create form. Drawing is checked first so a click can only
    // ever resolve to one mode, even if both flags were somehow set.
    if (placing) {
      pickPoint({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      return;
    }

    const hit = routeUnderCursor(event);
    if (hit) ga.consoleSelectRoute(hit.routeId);
    setSelectedRouteId(hit?.routeId ?? null);
  };

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
                  ? editorDetail.directions.reduce((n, d) => n + d.tripCount, 0)
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

            <RouteTabBody
              route={selected}
              isMaintainer={isMaintainer}
              canDraw={canDraw}
              onChanged={reloadEditorDetail}
            />
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
                title={route.longName}
                type="button"
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

        <div
          ref={mapShellRef}
          className="relative h-[90vh] min-h-100 overflow-hidden rounded-lg"
        >
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
          <ShapeDrawToolbar
            onSave={shape.onSaveShape}
            onCancel={shape.onCancelShape}
          />
          {contextMenu && (
            <ShapeContextMenu
              directionLabel={shape.menuDirectionLabel}
              canReset={shape.menuCanReset}
              onEditShape={shape.onEditShapeFromMenu}
              onResetShape={shape.onResetShapeFromMenu}
            />
          )}
          {/* The console pulls both directions of 891 shapes at full drawing
              fidelity — a few megabytes. Without this the map paints an empty
              basemap first and the network pops in, which reads as "no routes"
              rather than "still loading". */}
          {!geojson && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded-lg border border-[#E2E6DE] bg-white/95 px-2.5 py-1.5 text-[12.5px] text-[#5C6B5E] shadow-sm backdrop-blur"
            >
              Loading routes…
            </div>
          )}
          {hover.route && (
            <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 flex max-w-[80%] items-center gap-2 rounded-lg border border-[#E2E6DE] bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur">
              <RouteChip
                shortName={hover.route.shortName}
                operatorCode={hover.route.operatorCode}
                size="sm"
              />
              <span className="min-w-0 truncate text-[12.5px] font-medium text-[#1C2321]">
                {hover.route.longName}
              </span>
              {hover.route.closure && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={statusStyle(hover.route.closure)}
                >
                  {statusLabel(hover.route.closure)}
                </span>
              )}
            </div>
          )}
          <MapGl
            ref={mapRef}
            initialViewState={{ ...ADDIS_CENTER, zoom: 11 }}
            mapStyle={BASEMAP_STYLE}
            canvasContextAttributes={{ preserveDrawingBuffer: true }}
            interactiveLayerIds={
              drawing
                ? [SHAPE_WAYPOINT_LAYER_ID]
                : placing
                  ? []
                  : ["routes-open", "routes-closed"]
            }
            // A crosshair says "this click means a coordinate", which is the
            // only cue that the next click will not select a route.
            cursor={placing ? "crosshair" : undefined}
            // A double-click would otherwise drop two waypoints and zoom.
            doubleClickZoom={!drawing}
            onClick={onMapClick}
            onContextMenu={shape.onContextMenu}
            onMouseMove={hover.onMouseMove}
            onMouseLeave={hover.onMouseLeave}
            onMoveStart={contextMenu ? closeContextMenu : undefined}
            style={{ width: "100%", height: "100%" }}
          >
            <PickedStopLayer point={pickedPoint} />
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
                {hover.routeId && (
                  <Layer
                    id="routes-hover-casing"
                    type="line"
                    filter={hover.filter}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": "#FFFFFF",
                      "line-width": ROUTE_HOVER_CASING_WIDTH,
                      "line-opacity": 0.95,
                    }}
                  />
                )}
                {hover.routeId && (
                  <Layer
                    id="routes-hover-line"
                    type="line"
                    filter={hover.filter}
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
                      // Dimmed while drawing: the old line is a reference to
                      // trace, not the thing being edited.
                      "line-opacity": drawing ? 0.25 : 0.9,
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
              stops={hover.stops}
              variant="route"
              visible={Boolean(
                hover.routeId && hover.stops.length && !selectedRouteId,
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

            <ShapeDrawLayer />
          </MapGl>
        </div>
        <div className="mt-2 text-[11.5px] text-[#7E9182]">
          {drawing
            ? "Click to place a point · right-click a point to remove it · Esc to cancel"
            : "Click a route line to select it, or right-click it to edit its shape"}
        </div>
      </div>
    </div>
  );
}
