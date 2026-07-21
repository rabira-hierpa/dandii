"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MapGl, {
  Layer,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SearchLg } from "@untitledui/icons";
import { toggleSavedRoute } from "@/actions/saved-routes";
import { RouteChip } from "@/components/console/route-chip";
import type { AccountData } from "@/lib/account";
import {
  CLOSED_ROUTE_COLOR,
  OPERATOR_CODES,
  OPERATOR_META,
} from "@/lib/operators";
import { recordSearch } from "@/lib/recent-searches";
import { useMapStore } from "@/stores/map-store";
import { cx } from "@/utils/cx";
import { AccountDrawer } from "./account-drawer";
import { BottomSheet } from "./bottom-sheet";
import { DirectionsPanel, type DirectionsEndpoint } from "./directions-panel";
import { FloatingControls } from "./floating-controls";
import { LayersPanel } from "./layers-panel";
import { BlueDotMarker } from "./markers";
import {
  ADDIS_CENTER,
  applyRouteHoverTransitions,
  BASEMAP_STYLE,
  ROUTE_HOVER_CASING_WIDTH,
  ROUTE_HOVER_LINE_WIDTH,
  ROUTE_LINE_COLOR,
  ROUTE_LINE_WIDTH,
} from "./map-style";
import {
  MODE_META,
  type ClassifiedItinerary,
  type ModeKey,
} from "./route-modes";
import { decodePolyline } from "./polyline";
import { RouteSheet } from "./route-sheet";
import { StopMarkersLayer } from "./stop-markers-layer";
import type {
  RouteDetail,
  RouteHoverPreview,
  RouteSearchResult,
  StopSearchResult,
} from "./types";

function boundsOf(coordinates: [number, number][]) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ] as [[number, number], [number, number]];
}

/**
 * Padding that keeps geometry clear of the sheet (mobile) or panel
 * (desktop). `withSidePanel` accounts for the detail panel that opens
 * beside the main panel when a route/stop is selected.
 */
function fitPadding(withSidePanel = false) {
  const mobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 639px)").matches;
  if (mobile) {
    return {
      top: 90,
      bottom: Math.round(window.innerHeight * 0.5),
      left: 40,
      right: 40,
    };
  }
  return { top: 80, bottom: 80, left: withSidePanel ? 840 : 440, right: 80 };
}

const routeHoverCache = new Map<string, RouteHoverPreview>();

/** Stop details card shared by the mobile sheet and the desktop side panel. */
function StopCard({
  stop,
  onDirections,
}: {
  stop: StopSearchResult;
  onDirections: (stop: StopSearchResult) => void;
}) {
  return (
    <div className="rounded-2xl bg-[#F8F9FA] p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="size-3 shrink-0 rounded-full border-[3px] border-[#1A73E8] bg-white" />
        <div className="min-w-0 flex-1 text-[14px] font-semibold text-[#202124]">
          {stop.name}
        </div>
      </div>
      <div className="mt-1 pl-5.5 text-[11.5px] text-[#5F6368]">
        {stop.lat.toFixed(5)}, {stop.lon.toFixed(5)}
      </div>
      <button
        onClick={() => onDirections(stop)}
        className="mt-3 w-full cursor-pointer rounded-full bg-[#1A73E8] py-2 text-[13px] font-semibold text-white hover:bg-[#1765CC]"
      >
        Directions to here
      </button>
    </div>
  );
}

interface PublicMapProps {
  user: { name: string; email: string; hasConsoleAccess: boolean } | null;
  account: AccountData | null;
}

export function PublicMap({ user, account }: PublicMapProps) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const { selectedRouteId, setSelectedRouteId, hiddenOperators, setSheetSnap } =
    useMapStore();

  // Optimistic saved-route ids (server data + local toggles). Re-sync from the
  // server prop across router.refresh() cycles via render-time comparison.
  const [savedRouteIds, setSavedRouteIds] = useState<Set<string>>(
    () => new Set(account?.savedRoutes.map((r) => r.routeId) ?? []),
  );
  const [prevAccount, setPrevAccount] = useState(account);
  if (account !== prevAccount) {
    setPrevAccount(account);
    setSavedRouteIds(new Set(account?.savedRoutes.map((r) => r.routeId) ?? []));
  }

  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(
    null,
  );
  const [hubStops, setHubStops] = useState<StopSearchResult[]>([]);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [fetchedHoverPreview, setFetchedHoverPreview] = useState<{
    routeId: string;
    data: RouteHoverPreview;
  } | null>(null);
  const [tab, setTab] = useState<"explore" | "directions">("explore");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    routes: RouteSearchResult[];
    stops: StopSearchResult[];
  }>({ routes: [], stops: [] });
  const [routeDetail, setRouteDetail] = useState<{
    routeId: string;
    detail: RouteDetail;
  } | null>(null);
  const [selectedStop, setSelectedStop] = useState<StopSearchResult | null>(
    null,
  );
  const [stopBounceKey, setStopBounceKey] = useState(0);
  const [myLocation, setMyLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  // Directions state
  const [directionsResults, setDirectionsResults] = useState<
    ClassifiedItinerary[] | null
  >(null);
  const [activeMode, setActiveMode] = useState<ModeKey | null>(null);
  const [endpoints, setEndpoints] = useState<{
    from: DirectionsEndpoint;
    to: DirectionsEndpoint;
  } | null>(null);
  // Lifted from DirectionsPanel — it renders twice (mobile sheet + desktop
  // panel), so endpoint state must live here to stay in sync.
  const [dirFrom, setDirFrom] = useState<DirectionsEndpoint | null>(null);
  const [dirTo, setDirTo] = useState<DirectionsEndpoint | null>(null);

  // A hover is only effective while its operator layer is toggled on — this
  // also neutralizes a stale hover when its layer gets hidden mid-hover.
  const operatorByRouteId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const feature of geojson?.features ?? []) {
      map.set(
        feature.properties?.routeId as string,
        (feature.properties?.operatorCode as string | null) ?? null,
      );
    }
    return map;
  }, [geojson]);
  const hoveredOperator = hoveredRouteId
    ? operatorByRouteId.get(hoveredRouteId)
    : null;
  const visibleHoveredRouteId =
    hoveredRouteId &&
    !hiddenOperators.includes(
      hoveredOperator as (typeof hiddenOperators)[number],
    )
      ? hoveredRouteId
      : null;

  const effectiveHoverId =
    visibleHoveredRouteId && visibleHoveredRouteId !== selectedRouteId
      ? visibleHoveredRouteId
      : null;
  const hoverPreview =
    effectiveHoverId == null
      ? null
      : (routeHoverCache.get(effectiveHoverId) ??
        (fetchedHoverPreview?.routeId === effectiveHoverId
          ? fetchedHoverPreview.data
          : null));
  const results =
    query.trim().length < 2 ? { routes: [], stops: [] } : searchResults;
  const detail =
    selectedRouteId && routeDetail?.routeId === selectedRouteId
      ? routeDetail.detail
      : null;
  const hasDirections = directionsResults !== null && tab === "directions";

  useEffect(() => {
    fetch("/api/geo/routes")
      .then((res) => res.json())
      .then(setGeojson);
    fetch("/api/geo/hub-stops")
      .then((res) => res.json())
      .then((data: GeoJSON.FeatureCollection) => {
        setHubStops(
          data.features.map((feature) => ({
            id: feature.properties?.stopId as string,
            name: feature.properties?.name as string,
            lat: (feature.geometry as GeoJSON.Point).coordinates[1],
            lon: (feature.geometry as GeoJSON.Point).coordinates[0],
          })),
        );
      });
  }, []);

  // Fetch stop list + full geometry for the hovered route (desktop).
  useEffect(() => {
    if (!effectiveHoverId) return;
    if (routeHoverCache.has(effectiveHoverId)) return;

    const controller = new AbortController();
    let cancelled = false;

    const handle = setTimeout(() => {
      const request = fetch(`/api/routes/${effectiveHoverId}/hover`, {
        signal: controller.signal,
      });
      request.catch(() => {});
      void request
        .then((res) => (res.ok ? res.json() : null))
        .then((data: RouteHoverPreview | null) => {
          if (cancelled || !data) return;
          routeHoverCache.set(effectiveHoverId, data);
          setFetchedHoverPreview({ routeId: effectiveHoverId, data });
        })
        .catch(() => {});
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      controller.abort();
    };
  }, [effectiveHoverId]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !hoveredRouteId) return;
    const apply = () => applyRouteHoverTransitions(map);
    if (map.isStyleLoaded()) apply();
    else map.once("idle", apply);
  }, [hoveredRouteId, hoverPreview]);

  // Search-as-you-type.
  useEffect(() => {
    if (query.trim().length < 2) return;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      setSearchResults(await res.json());
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  // Load route detail when a route is selected.
  useEffect(() => {
    if (!selectedRouteId) return;
    let cancelled = false;
    fetch(`/api/routes/${selectedRouteId}`)
      .then((res) => res.json())
      .then((data: RouteDetail) => {
        if (cancelled) return;
        setRouteDetail({ routeId: selectedRouteId, detail: data });
        if (data.geojson?.coordinates?.length) {
          mapRef.current?.fitBounds(
            boundsOf(data.geojson.coordinates as [number, number][]),
            // Selecting a route opens the detail side panel on desktop.
            { padding: fitPadding(true), duration: 800 },
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRouteId]);

  // Fit the active itinerary whenever mode/results change.
  useEffect(() => {
    if (!directionsResults || !activeMode) return;
    const active = directionsResults.find((r) => r.mode === activeMode);
    if (!active) return;
    const coords = active.itinerary.legs.flatMap((leg) =>
      leg.legGeometry ? decodePolyline(leg.legGeometry.points) : [],
    );
    if (coords.length > 0) {
      mapRef.current?.fitBounds(boundsOf(coords), {
        padding: fitPadding(),
        duration: 700,
      });
    }
  }, [directionsResults, activeMode]);

  const selectRoute = (routeId: string) => {
    if (query.trim().length >= 2) recordSearch(query);
    setSelectedStop(null);
    setHoveredRouteId(null);
    setSelectedRouteId(routeId);
    setSheetSnap("half");
  };

  const selectStop = (stop: StopSearchResult) => {
    if (query.trim().length >= 2) recordSearch(query);
    setSelectedRouteId(null);
    setSelectedStop(stop);
    setStopBounceKey((k) => k + 1);
    setSheetSnap("half");
    mapRef.current?.flyTo({
      center: [stop.lon, stop.lat],
      zoom: 15,
      duration: 800,
    });
  };

  // Save/unsave the selected route (optimistic; server confirms via refresh).
  const onToggleSave = (routeId: string) => {
    setSavedRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
    void toggleSavedRoute({ routeId }).then((res) => {
      if (!res.ok) {
        // Roll back on failure.
        setSavedRouteIds(
          new Set(account?.savedRoutes.map((r) => r.routeId) ?? []),
        );
      } else {
        router.refresh();
      }
    });
  };

  // Share deep-link: open the route named by ?route=<id> on first load.
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current) return;
    if (typeof window === "undefined") return;
    const routeId = new URLSearchParams(window.location.search).get("route");
    if (routeId) {
      deepLinkedRef.current = true;
      setSelectedRouteId(routeId);
      setSheetSnap("half");
    }
  }, [setSelectedRouteId, setSheetSnap]);

  /** Back navigation from a route/stop detail to the results (or map). */
  const clearSelection = () => {
    setSelectedRouteId(null);
    setSelectedStop(null);
  };

  const onMapClick = (event: MapLayerMouseEvent) => {
    if (hasDirections) return;
    const feature = event.features?.find(
      (f) =>
        !hiddenOperators.includes(
          f.properties?.operatorCode as (typeof hiddenOperators)[number],
        ),
    );
    if (feature) selectRoute(feature.properties.routeId as string);
  };

  const previewRoute = useCallback((routeId: string | null) => {
    setHoveredRouteId(routeId);
  }, []);

  const onMapMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      if (selectedRouteId || hasDirections) return;
      // Only hover routes whose operator layer is toggled on — hidden lines
      // are invisible (opacity 0) but still hit-testable in MapLibre.
      const feature = event.features?.find(
        (f) =>
          f.layer.id === "routes-all" &&
          !hiddenOperators.includes(
            f.properties?.operatorCode as (typeof hiddenOperators)[number],
          ),
      );
      const routeId = feature?.properties?.routeId as string | undefined;
      const canvas = mapRef.current?.getCanvas();
      if (canvas) canvas.style.cursor = routeId ? "pointer" : "";
      if (routeId && routeId !== hoveredRouteId) previewRoute(routeId);
      else if (!routeId && hoveredRouteId) previewRoute(null);
    },
    [
      hoveredRouteId,
      hasDirections,
      hiddenOperators,
      previewRoute,
      selectedRouteId,
    ],
  );

  const onMapMouseLeave = useCallback(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = "";
    if (!selectedRouteId) previewRoute(null);
  }, [previewRoute, selectedRouteId]);

  const onLocate = (coords: { lat: number; lon: number }) => {
    setMyLocation(coords);
    mapRef.current?.flyTo({
      center: [coords.lon, coords.lat],
      zoom: 15,
      duration: 900,
    });
  };

  const hoverFilter: FilterSpecification = visibleHoveredRouteId
    ? ["==", ["get", "routeId"], visibleHoveredRouteId]
    : ["==", ["get", "routeId"], ""];

  const visibleCodes = useMemo(
    () => [
      ...OPERATOR_CODES.filter((code) => !hiddenOperators.includes(code)),
      "UNKNOWN",
    ],
    [hiddenOperators],
  );

  const overlayActive = Boolean(
    visibleHoveredRouteId || detail || hasDirections,
  );

  /** Fade lines of hidden operators instead of hard filtering. */
  const routeOpacity = useMemo(
    () =>
      [
        "case",
        [
          "in",
          ["coalesce", ["get", "operatorCode"], "UNKNOWN"],
          ["literal", visibleCodes],
        ],
        overlayActive ? 0.18 : 0.62,
        0,
      ] as unknown as number,
    [visibleCodes, overlayActive],
  );

  const showHubStops =
    tab === "explore" &&
    !selectedRouteId &&
    !hasDirections &&
    !visibleHoveredRouteId;
  const showHoverStops = Boolean(
    visibleHoveredRouteId && hoverPreview?.stops.length && !selectedRouteId,
  );
  const showSelectedStops = Boolean(
    selectedRouteId && detail?.stops.length && !hasDirections,
  );

  const detailGeojson = useMemo(
    () =>
      detail?.geojson
        ? ({
            type: "Feature",
            geometry: detail.geojson,
            properties: {},
          } as GeoJSON.Feature)
        : null,
    [detail],
  );

  /** All alternatives, dimmed; the active mode is drawn on top, full color. */
  const itinerariesGeojson = useMemo(() => {
    if (!directionsResults) return null;
    return {
      type: "FeatureCollection",
      features: directionsResults.flatMap((result) =>
        result.itinerary.legs
          .filter((leg) => leg.legGeometry)
          .map((leg) => ({
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: decodePolyline(leg.legGeometry!.points),
            },
            properties: {
              mode: result.mode,
              walk: leg.mode === "WALK",
              color: MODE_META[result.mode].color,
              colorDim: MODE_META[result.mode].colorDim,
            },
          })),
      ),
    } as GeoJSON.FeatureCollection;
  }, [directionsResults]);

  const activeFilter: FilterSpecification = [
    "==",
    ["get", "mode"],
    activeMode ?? "",
  ];
  const inactiveFilter: FilterSpecification = [
    "!=",
    ["get", "mode"],
    activeMode ?? "",
  ];

  const hasSearchResults =
    query.trim().length >= 2 &&
    (results.routes.length > 0 || results.stops.length > 0);

  const openDirectionsTo = (stop: StopSearchResult) => {
    setDirTo({ ...stop });
    setTab("directions");
    setSheetSnap("half");
  };

  const exitDirections = () => {
    setDirectionsResults(null);
    setActiveMode(null);
    setEndpoints(null);
  };

  /** Sheet/panel content (rendered in both the mobile sheet and desktop panel). */
  const sheetContent = (
    <div className="flex flex-col gap-3">
      {/* Header: brand + tabs */}
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          {/* Use Intern font for the brand name */}
          <div className="text-md font-semibold font-intern tracking-widest text-[#15803D]">
            Dandii
          </div>
        </div>
        <div className="ml-auto flex shrink-0 rounded-full bg-[#F1F3F4] p-0.5">
          {(["explore", "directions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === "explore") exitDirections();
              }}
              className={cx(
                "cursor-pointer rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize",
                tab === t
                  ? "bg-white text-[#1A73E8] shadow-sm"
                  : "text-[#5F6368]",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "explore" ? (
        <div className="flex flex-col gap-2.5">
          {/* Search (desktop panel; mobile uses the floating pill) */}
          <div className="relative max-sm:hidden">
            <SearchLg className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-[#5F6368]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search routes and stops"
              className="w-full rounded-full bg-[#F1F3F4] py-2.5 pr-4 pl-10 text-[14px] text-[#202124] placeholder:text-[#5F6368] focus:bg-white focus:outline-2 focus:outline-[#1A73E8]"
            />
          </div>

          {/* Results stay visible beside the detail panel on desktop
              (Google-Maps style); on mobile the detail takes over the sheet. */}
          {hasSearchResults && (
            <div
              className={cx(
                "flex flex-col gap-0.5",
                (detail || selectedStop) && "max-sm:hidden",
              )}
            >
              {results.routes.length > 0 && (
                <div className="mt-1 text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
                  Routes
                </div>
              )}
              {results.routes.map((route) => (
                <button
                  key={route.id}
                  onClick={() => selectRoute(route.id)}
                  onMouseEnter={() => previewRoute(route.id)}
                  onMouseLeave={() => previewRoute(null)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left",
                    route.id === selectedRouteId
                      ? "bg-[#E8F0FE]"
                      : "hover:bg-[#F8F9FA]",
                  )}
                >
                  <RouteChip
                    shortName={route.shortName}
                    operatorCode={route.operatorCode}
                    size="sm"
                  />
                  <span className="min-w-0 truncate text-[13px] text-[#202124]">
                    {route.longName}
                  </span>
                </button>
              ))}
              {results.stops.length > 0 && (
                <div className="mt-1 text-[10.5px] font-semibold tracking-wide text-[#5F6368] uppercase">
                  Stops
                </div>
              )}
              {results.stops.map((stop) => (
                <button
                  key={stop.id}
                  onClick={() => selectStop(stop)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-left",
                    stop.id === selectedStop?.id
                      ? "bg-[#E8F0FE]"
                      : "hover:bg-[#F8F9FA]",
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-full border-[3px] border-[#1A73E8] bg-white" />
                  <span className="min-w-0 truncate text-[13px] text-[#202124]">
                    {stop.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {query.trim().length >= 2 && !hasSearchResults && (
            <div className="py-2 text-center text-[13px] text-[#80868B]">
              No routes or stops found.
            </div>
          )}

          {/* Mobile: detail replaces the sheet content, with back nav.
              Desktop shows details in the separate side panel instead. */}
          {(selectedStop || detail) && (
            <div className="flex flex-col gap-2 sm:hidden">
              <button
                onClick={clearSelection}
                className="flex cursor-pointer items-center gap-1.5 self-start rounded-full px-2 py-1 text-[13px] font-semibold text-[#1A73E8] hover:bg-[#F1F3F4]"
              >
                ← {hasSearchResults ? "Back to results" : "Back to map"}
              </button>
              {selectedStop && !detail && (
                <StopCard stop={selectedStop} onDirections={openDirectionsTo} />
              )}
              {detail && (
                <RouteSheet
                  detail={detail}
                  onClose={clearSelection}
                  signedIn={Boolean(user)}
                  isSaved={savedRouteIds.has(detail.id)}
                  onToggleSave={() => onToggleSave(detail.id)}
                />
              )}
            </div>
          )}

          {query.trim().length < 2 && !selectedStop && !detail && (
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 pt-0.5">
              {Object.values(OPERATOR_META).map((meta) => (
                <span
                  key={meta.code}
                  className={cx(
                    "flex items-center gap-1.5 text-[11.5px] font-medium",
                    hiddenOperators.includes(meta.code)
                      ? "text-[#BDC1C6] line-through"
                      : "text-[#5F6368]",
                  )}
                >
                  <span
                    className="h-1 w-4 rounded-sm"
                    style={{ background: meta.color }}
                  />
                  {meta.short}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <DirectionsPanel
          from={dirFrom}
          to={dirTo}
          setFrom={setDirFrom}
          setTo={setDirTo}
          results={directionsResults}
          activeMode={activeMode}
          onActiveMode={setActiveMode}
          onResults={setDirectionsResults}
          onEndpoints={setEndpoints}
        />
      )}
    </div>
  );

  const accountDrawer =
    user && account ? (
      <AccountDrawer
        user={user}
        account={account}
        selectedRoute={
          detail ? { id: detail.id, shortName: detail.shortName } : null
        }
        onOpenRoute={selectRoute}
        onRunSearch={(q) => {
          setQuery(q);
          setTab("explore");
          setSheetSnap("half");
        }}
      />
    ) : null;

  return (
    <div className="fixed inset-0 h-dvh w-full overflow-hidden">
      <MapGl
        ref={mapRef}
        initialViewState={{ ...ADDIS_CENTER, zoom: 11.5 }}
        mapStyle={BASEMAP_STYLE}
        canvasContextAttributes={{ preserveDrawingBuffer: true }}
        interactiveLayerIds={["routes-all"]}
        onClick={onMapClick}
        onMouseMove={onMapMouseMove}
        onMouseLeave={onMapMouseLeave}
        style={{ width: "100%", height: "100%" }}
      >
        {geojson && (
          <Source id="routes" type="geojson" data={geojson}>
            <Layer
              id="routes-all"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": ROUTE_LINE_COLOR,
                "line-width": ROUTE_LINE_WIDTH,
                "line-opacity": routeOpacity,
                "line-opacity-transition": { duration: 350, delay: 0 },
              }}
            />
            {visibleHoveredRouteId ? (
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
            ) : null}
            {visibleHoveredRouteId ? (
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
            ) : null}
          </Source>
        )}

        <StopMarkersLayer
          id="hub-stops"
          stops={hubStops}
          variant="hub"
          visible={showHubStops}
        />

        {detailGeojson && !hasDirections && (
          <Source id="selected-route" type="geojson" data={detailGeojson}>
            <Layer
              id="selected-route-casing"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#FFFFFF", "line-width": 8 }}
            />
            <Layer
              id="selected-route-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": detail?.closure
                  ? CLOSED_ROUTE_COLOR
                  : (OPERATOR_META[detail?.operator?.code ?? "SHEGER"].color ??
                    "#15803D"),
                "line-width": 4.5,
                ...(detail?.closure
                  ? { "line-dasharray": [2, 1.5] as [number, number] }
                  : {}),
              }}
            />
          </Source>
        )}

        <StopMarkersLayer
          id="hover-stops"
          stops={hoverPreview?.stops ?? []}
          variant="route"
          visible={showHoverStops}
          onLine
        />
        <StopMarkersLayer
          id="selected-stops"
          stops={detail?.stops ?? []}
          variant="route"
          visible={showSelectedStops}
          onLine
        />

        {/* Directions: dimmed alternatives below, active mode on top. */}
        {itinerariesGeojson && hasDirections && (
          <Source id="itineraries" type="geojson" data={itinerariesGeojson}>
            <Layer
              id="itin-inactive"
              type="line"
              filter={inactiveFilter}
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": ["get", "colorDim"],
                "line-width": 4,
                "line-opacity": 0.75,
              }}
            />
            <Layer
              id="itin-active-casing"
              type="line"
              filter={activeFilter}
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#FFFFFF", "line-width": 10 }}
            />
            <Layer
              id="itin-active"
              type="line"
              filter={activeFilter}
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": ["get", "color"],
                "line-width": 5.5,
                ...(activeMode ? {} : {}),
              }}
            />
            {/* Walk segments of the active route drawn dotted. */}
            <Layer
              id="itin-active-walk"
              type="line"
              filter={["all", activeFilter, ["==", ["get", "walk"], true]]}
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#FFFFFF",
                "line-width": 2,
                "line-dasharray": [0.1, 1.6],
              }}
            />
          </Source>
        )}

        {/* Endpoint markers — the blue dot system. */}
        {endpoints && hasDirections && (
          <>
            <BlueDotMarker
              longitude={endpoints.from.lon}
              latitude={endpoints.from.lat}
              label={endpoints.from.name}
              pulse
              onClick={() =>
                mapRef.current?.flyTo({
                  center: [endpoints.from.lon, endpoints.from.lat],
                  zoom: 15,
                  duration: 600,
                })
              }
            />
            <BlueDotMarker
              longitude={endpoints.to.lon}
              latitude={endpoints.to.lat}
              label={endpoints.to.name}
              color="#D93025"
              onClick={() =>
                mapRef.current?.flyTo({
                  center: [endpoints.to.lon, endpoints.to.lat],
                  zoom: 15,
                  duration: 600,
                })
              }
            />
          </>
        )}

        {selectedStop && !hasDirections && (
          <BlueDotMarker
            key={stopBounceKey}
            longitude={selectedStop.lon}
            latitude={selectedStop.lat}
            label={selectedStop.name}
            bounce
            onClick={() => selectStop(selectedStop)}
          />
        )}

        {myLocation && (
          <BlueDotMarker
            longitude={myLocation.lon}
            latitude={myLocation.lat}
            label="Your location"
            pulse
          />
        )}
      </MapGl>

      {/* Mobile: floating top search pill + auth avatar */}
      <div className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 sm:hidden">
        <div className="relative flex-1">
          <SearchLg className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-[#5F6368]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setTab("explore");
              setSheetSnap("half");
            }}
            placeholder="Search Addis transit"
            className="h-12 w-full rounded-full bg-white pr-4 pl-11 text-[15px] text-[#202124] shadow-[0_1px_6px_rgba(0,0,0,0.25)] placeholder:text-[#5F6368] focus:outline-none"
          />
        </div>
        {accountDrawer ?? (
          <Link
            href="/sign-in"
            aria-label="Sign in"
            className="flex h-12 shrink-0 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-[#1A73E8] shadow-[0_1px_6px_rgba(0,0,0,0.25)]"
          >
            Sign in
          </Link>
        )}
      </div>

      {/* Desktop: account drawer (signed in) or sign-in pill */}
      <div className="absolute top-4 right-4 z-20 max-sm:hidden">
        {accountDrawer ?? (
          <Link
            href="/sign-in"
            className="rounded-full bg-[#152018] px-4 py-2 text-[13px] font-semibold text-white shadow-lg hover:bg-[#24352A]"
          >
            Sign in
          </Link>
        )}
      </div>

      {/* Desktop: detail side panel beside the main panel (Google-Maps
          style) — the results list stays visible in the main panel. */}
      {tab === "explore" && (detail || selectedStop) && (
        <div className="absolute top-4 left-[26rem] z-30 hidden max-h-[calc(100dvh-6rem)] w-96 flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5 sm:flex">
          <div className="flex items-center gap-1 border-b border-[#EEF1EA] px-3 py-2">
            <button
              onClick={clearSelection}
              aria-label="Back"
              className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-[#1A73E8] hover:bg-[#F1F3F4]"
            >
              ← {hasSearchResults ? "Back to results" : "Close"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {selectedStop && !detail && (
              <StopCard stop={selectedStop} onDirections={openDirectionsTo} />
            )}
            {detail && (
              <RouteSheet
                detail={detail}
                onClose={clearSelection}
                signedIn={Boolean(user)}
                isSaved={savedRouteIds.has(detail.id)}
                onToggleSave={() => onToggleSave(detail.id)}
              />
            )}
          </div>
        </div>
      )}

      <FloatingControls onLocate={onLocate} />
      <LayersPanel />
      <BottomSheet>{sheetContent}</BottomSheet>
    </div>
  );
}
