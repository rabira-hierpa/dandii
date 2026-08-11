"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import MapGl, {
  Layer,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClosure, endClosure } from "@/actions/closures";
import { DateTimePicker } from "@/components/application/date-picker/date-time-picker";
import { RouteChip } from "@/components/console/route-chip";
import { describeClosure, type ClosureKind } from "@/lib/closures";
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
  CLOSURE_REASON_LABELS,
  CLOSURE_REASONS,
  MAINTAINER_REASONS,
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

type RouteStop = { id: string; name: string };

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

function startOfMinute(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
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
  const router = useRouter();
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
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  // Hover preview — mirrors the public map so operators get the same feel.
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [fetchedHoverStops, setFetchedHoverStops] = useState<{
    routeId: string;
    stops: StopSearchResult[];
  } | null>(null);

  const [reason, setReason] = useState<ClosureReasonValue>(
    isMaintainer ? "MAINTENANCE" : "PUBLIC_HOLIDAY",
  );
  const [note, setNote] = useState("");
  const [startsAt, setStartsAt] = useState(() => startOfMinute(new Date()));
  const [endsAt, setEndsAt] = useState(() =>
    startOfMinute(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [dateError, setDateError] = useState<string | null>(null);
  // Floor for "no past dates" — refreshed when the selected route changes so a
  // long-lived panel doesn't keep a stale min from hours ago.
  const [nowFloor, setNowFloor] = useState(() => startOfMinute(new Date()));
  const [scope, setScope] = useState<"whole" | "partial">("whole");
  const [kind, setKind] = useState<"SEVERED" | "SKIPPED">("SEVERED");
  const [fromStopId, setFromStopId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  const loadGeojson = useCallback(async () => {
    setGeojson(await fetchRouteGeojson());
  }, []);

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

  // Load stop list when an open route is selected for the partial form.
  useEffect(() => {
    if (!selectedRouteId || selected?.closure) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStopsLoading(true);
    });
    void fetch(`/api/routes/${selectedRouteId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stops?: RouteStop[] } | null) => {
        if (cancelled) return;
        setRouteStops(data?.stops ?? []);
        setFromStopId("");
        setToStopId("");
        setScope("whole");
        setKind("SEVERED");
      })
      .catch(() => {
        if (!cancelled) setRouteStops([]);
      })
      .finally(() => {
        if (!cancelled) setStopsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRouteId, selected?.closure]);

  const previewSentence = useMemo(() => {
    if (
      scope !== "partial" ||
      !fromStopId ||
      !toStopId ||
      routeStops.length === 0
    ) {
      return null;
    }
    return describeClosure({ kind, fromStopId, toStopId }, routeStops);
  }, [scope, kind, fromStopId, toStopId, routeStops]);

  const partialReady =
    scope === "whole" ||
    (Boolean(fromStopId) &&
      Boolean(toStopId) &&
      fromStopId !== toStopId &&
      Boolean(kind));

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

  const availableReasons = isMaintainer ? MAINTAINER_REASONS : CLOSURE_REASONS;

  const onStartsAtChange = (next: Date) => {
    const floor = startOfMinute(new Date());
    const clamped = next < floor ? floor : next;
    setNowFloor(floor);
    setStartsAt(clamped);
    setDateError(null);
    if (endsAt <= clamped) {
      setEndsAt(new Date(clamped.getTime() + 60 * 60 * 1000));
    }
  };

  const onEndsAtChange = (next: Date) => {
    const floor = startOfMinute(new Date());
    setNowFloor(floor);
    const minEnd = startsAt > floor ? startsAt : floor;
    setEndsAt(
      next <= minEnd ? new Date(minEnd.getTime() + 60 * 60 * 1000) : next,
    );
    setDateError(null);
  };

  const submitClosure = () => {
    if (!selected || !partialReady) return;
    setFeedback(null);

    const floor = startOfMinute(new Date());
    setNowFloor(floor);
    const grace = floor.getTime() - 60_000;
    if (startsAt.getTime() < grace) {
      setDateError("Start cannot be in the past");
      return;
    }
    if (endsAt.getTime() < grace) {
      setDateError("End cannot be in the past");
      return;
    }
    if (endsAt <= startsAt) {
      setDateError("End must be after start");
      return;
    }
    setDateError(null);

    startTransition(async () => {
      try {
        const result = await createClosure({
          routeId: selected.id,
          reason,
          note: note || undefined,
          startsAt,
          endsAt,
          kind: scope === "whole" ? "WHOLE_ROUTE" : kind,
          fromStopId: scope === "partial" ? fromStopId : null,
          toStopId: scope === "partial" ? toStopId : null,
        });
        if (result.ok) {
          ga.consoleCloseRoute(selected.id, reason);
          setFeedback(
            scope === "partial"
              ? `${selected.shortName} partially closed · ${CLOSURE_REASON_LABELS[reason]}`
              : `${selected.shortName} closed · ${CLOSURE_REASON_LABELS[reason]}`,
          );
          setNote("");
          setScope("whole");
          await loadGeojson();
          router.refresh();
        } else {
          setFeedback(result.error);
        }
      } catch {
        setFeedback("Not allowed to create closures");
      }
    });
  };

  const submitReopen = (
    closureId: string,
    routeId: string,
    shortName: string,
  ) => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await endClosure(closureId);
        if (result.ok) {
          ga.consoleReopenRoute(routeId);
          setFeedback(`${shortName} reopened`);
          await loadGeojson();
          router.refresh();
        } else {
          setFeedback(result.error);
        }
      } catch {
        setFeedback("Not allowed to end closures");
      }
    });
  };

  return (
    <div className="flex items-start gap-4 max-xl:flex-col">
      <div className="flex w-90 shrink-0 flex-col gap-3 max-xl:w-full">
        {feedback && (
          <div
            className={cx(
              "rounded-full border px-3 py-1.5 text-[12.5px]",
              feedback.includes("Not allowed") ||
                feedback.toLowerCase().includes("must") ||
                feedback.toLowerCase().includes("invalid") ||
                feedback.toLowerCase().includes("need") ||
                feedback.toLowerCase().includes("past") ||
                feedback.toLowerCase().includes("cannot")
                ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                : "border-[#86EFAC] bg-[#DCFCE7] text-[#15803D]",
            )}
          >
            {feedback}
          </div>
        )}

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

            {selected.closure ? (
              <>
                <div
                  className="rounded-lg px-3 py-2 text-[12.5px]"
                  style={{
                    background:
                      selected.closure.kind === "WHOLE_ROUTE"
                        ? "#FEF2F2"
                        : "#FFF7ED",
                    color:
                      selected.closure.kind === "WHOLE_ROUTE"
                        ? "#991B1B"
                        : "#9A3412",
                  }}
                >
                  <div className="font-semibold">
                    {statusLabel(selected.closure)}
                  </div>
                  <ClosureSummary
                    closure={selected.closure}
                    routeId={selected.id}
                  />
                  <div className="mt-1">
                    {CLOSURE_REASON_LABELS[selected.closure.reason]}
                    {selected.closure.note && ` — ${selected.closure.note}`}
                  </div>
                  <div className="mt-0.5 text-[11.5px] opacity-75">
                    until {new Date(selected.closure.endsAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    submitReopen(
                      selected.closure!.id,
                      selected.id,
                      selected.shortName,
                    )
                  }
                  disabled={isPending}
                  className="cursor-pointer self-start rounded-lg border border-[#86EFAC] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#15803D] hover:bg-[#F0FDF4] disabled:opacity-50"
                >
                  {isPending ? "Reopening…" : "Reopen route"}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-xs font-semibold text-[#5C6B5E]">
                    Scope
                  </legend>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1C2321]">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "whole"}
                      onChange={() => setScope("whole")}
                    />
                    Whole route
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1C2321]">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "partial"}
                      onChange={() => setScope("partial")}
                    />
                    Part of the route
                  </label>
                </fieldset>

                {scope === "partial" && (
                  <>
                    {stopsLoading ? (
                      <div className="text-[12.5px] text-[#5C6B5E]">
                        Loading stops…
                      </div>
                    ) : routeStops.length === 0 ? (
                      <div className="text-[12.5px] text-[#B91C1C]">
                        Couldn’t load stops for this route.
                      </div>
                    ) : (
                      <>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                          Closed from
                          <select
                            value={fromStopId}
                            onChange={(e) => setFromStopId(e.target.value)}
                            className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321]"
                          >
                            <option value="">Select stop…</option>
                            {routeStops.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                          Closed to (inclusive)
                          <select
                            value={toStopId}
                            onChange={(e) => setToStopId(e.target.value)}
                            className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321]"
                          >
                            <option value="">Select stop…</option>
                            {routeStops.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <fieldset className="flex flex-col gap-2">
                          <legend className="text-xs font-semibold text-[#5C6B5E]">
                            What happens on the road?
                          </legend>
                          <label className="flex cursor-pointer gap-2 rounded-lg border border-[#D6DCD0] p-2.5 text-[12.5px] text-[#1C2321]">
                            <input
                              type="radio"
                              name="kind"
                              className="mt-0.5"
                              checked={kind === "SEVERED"}
                              onChange={() => setKind("SEVERED")}
                            />
                            <span>
                              <span className="font-semibold">
                                Road is blocked — buses can’t get through
                              </span>
                              <span className="mt-0.5 block text-[11.5px] text-[#5C6B5E]">
                                Cuts the route in two
                              </span>
                            </span>
                          </label>
                          <label className="flex cursor-pointer gap-2 rounded-lg border border-[#D6DCD0] p-2.5 text-[12.5px] text-[#1C2321]">
                            <input
                              type="radio"
                              name="kind"
                              className="mt-0.5"
                              checked={kind === "SKIPPED"}
                              onChange={() => setKind("SKIPPED")}
                            />
                            <span>
                              <span className="font-semibold">
                                Buses detour around it — they just skip these
                                stops
                              </span>
                              <span className="mt-0.5 block text-[11.5px] text-[#5C6B5E]">
                                Line still runs end-to-end
                              </span>
                            </span>
                          </label>
                        </fieldset>
                        <div
                          aria-live="polite"
                          className="rounded-lg bg-[#F8FAF6] px-3 py-2 text-[12.5px] text-[#3D4A3F]"
                        >
                          {previewSentence ??
                            "Pick two stops to see what riders will see."}
                        </div>
                      </>
                    )}
                  </>
                )}

                <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                  Reason
                  <select
                    value={reason}
                    onChange={(e) =>
                      setReason(e.target.value as ClosureReasonValue)
                    }
                    className="cursor-pointer rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321]"
                  >
                    {availableReasons.map((value) => (
                      <option key={value} value={value}>
                        {CLOSURE_REASON_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                  Note (optional)
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Adwa Victory Day"
                    className="rounded-lg border border-[#D6DCD0] bg-white px-2.5 py-2 text-[13px] font-normal text-[#1C2321]"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <DateTimePicker
                    label="From"
                    value={startsAt}
                    minValue={nowFloor}
                    onChange={onStartsAtChange}
                    isInvalid={Boolean(
                      dateError?.toLowerCase().includes("start"),
                    )}
                  />
                  <DateTimePicker
                    label="Until"
                    value={endsAt}
                    minValue={startsAt > nowFloor ? startsAt : nowFloor}
                    onChange={onEndsAtChange}
                    isInvalid={Boolean(
                      dateError && !dateError.toLowerCase().includes("start"),
                    )}
                  />
                </div>
                {dateError && (
                  <p className="text-[12px] font-medium text-[#B91C1C]">
                    {dateError}
                  </p>
                )}
                <button
                  onClick={submitClosure}
                  disabled={isPending || !partialReady}
                  className="cursor-pointer self-start rounded-lg border border-[#FCA5A5] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                >
                  {isPending
                    ? "Closing…"
                    : scope === "partial"
                      ? "Close this section"
                      : "Close route"}
                </button>
              </div>
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
              visible={Boolean(effectiveHover && hoverStops.length)}
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

/** Rider-facing sentence for an active closure (fetches stops when partial). */
function ClosureSummary({
  closure,
  routeId,
}: {
  readonly closure: NonNullable<NetworkRoute["closure"]>;
  readonly routeId: string;
}) {
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (closure.kind === "WHOLE_ROUTE") return;
    let cancelled = false;
    void fetch(`/api/routes/${routeId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stops?: RouteStop[] } | null) => {
        if (cancelled || !data?.stops) return;
        setSummary(describeClosure(closure, data.stops));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [closure, routeId]);

  const text =
    closure.kind === "WHOLE_ROUTE" ? describeClosure(closure, []) : summary;
  if (!text) return null;
  return <div className="mt-1">{text}</div>;
}
