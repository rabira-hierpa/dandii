"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MapGl, { Layer, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { createClosure, endClosure } from "@/actions/closures";
import { RouteChip } from "@/components/console/route-chip";
import {
  ADDIS_CENTER,
  BASEMAP_STYLE,
  ROUTE_LINE_COLOR,
  ROUTE_LINE_WIDTH,
} from "@/components/map/map-style";
import {
  CLOSED_ROUTE_COLOR,
  CLOSURE_REASON_LABELS,
  CLOSURE_REASONS,
  MAINTAINER_REASONS,
  OPERATOR_META,
  type ClosureReasonValue,
  type OperatorCode,
} from "@/lib/operators";
import { useMapStore } from "@/stores/map-store";
import { cx } from "@/utils/cx";

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
  } | null;
}

interface NetworkMapProps {
  routes: NetworkRoute[];
  isMaintainer: boolean;
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function fetchRouteGeojson() {
  return fetch(`/api/geo/routes?t=${Date.now()}`, { cache: "no-store" }).then(
    (res) => res.json() as Promise<GeoJSON.FeatureCollection>,
  );
}

export function NetworkMap({ routes, isMaintainer }: NetworkMapProps) {
  const router = useRouter();
  const { selectedRouteId, setSelectedRouteId } = useMapStore();
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [panelSearch, setPanelSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const [reason, setReason] = useState<ClosureReasonValue>(
    isMaintainer ? "MAINTENANCE" : "PUBLIC_HOLIDAY",
  );
  const [note, setNote] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date()));
  const [endsAt, setEndsAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );

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
  const openCount = routes.length - closedRoutes.length;

  const panelRoutes = useMemo(() => {
    const q = panelSearch.trim().toLowerCase();
    const source = q
      ? routes.filter(
          (r) =>
            r.shortName.toLowerCase().includes(q) ||
            r.longName.toLowerCase().includes(q),
        )
      : closedRoutes;
    return source.slice(0, 30);
  }, [panelSearch, routes, closedRoutes]);

  const onMapClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    setSelectedRouteId(
      feature ? (feature.properties.routeId as string) : null,
    );
  };

  const availableReasons = isMaintainer ? MAINTAINER_REASONS : CLOSURE_REASONS;

  const submitClosure = () => {
    if (!selected) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await createClosure({
          routeId: selected.id,
          reason,
          note: note || undefined,
          startsAt: new Date(startsAt),
          endsAt: new Date(endsAt),
        });
        if (result.ok) {
          setFeedback(`${selected.shortName} closed · ${CLOSURE_REASON_LABELS[reason]}`);
          setNote("");
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

  const submitReopen = (closureId: string, shortName: string) => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await endClosure(closureId);
        if (result.ok) {
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
      <div className="min-w-0 flex-[1_1_620px] rounded-xl border border-[#E2E6DE] bg-white p-4 max-xl:w-full">
        <div className="mb-2.5 flex flex-wrap items-center gap-4">
          {Object.values(OPERATOR_META).map((meta) => (
            <span
              key={meta.code}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#5C6B5E]"
            >
              <span
                className="h-1 w-4.5 rounded-sm"
                style={{ background: meta.color }}
              />
              {meta.short}
            </span>
          ))}
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
            {openCount} open · {closedRoutes.length} closed
          </span>
        </div>

        <div className="h-[62vh] min-h-100 overflow-hidden rounded-lg">
          <MapGl
            initialViewState={{ ...ADDIS_CENTER, zoom: 11 }}
            mapStyle={BASEMAP_STYLE}
            canvasContextAttributes={{ preserveDrawingBuffer: true }}
            interactiveLayerIds={["routes-open", "routes-closed"]}
            onClick={onMapClick}
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
                    "line-opacity": 0.75,
                  }}
                />
                <Layer
                  id="routes-closed"
                  type="line"
                  filter={["==", ["get", "closed"], true]}
                  paint={{
                    "line-color": CLOSED_ROUTE_COLOR,
                    "line-width": ROUTE_LINE_WIDTH,
                    "line-opacity": 0.9,
                    "line-dasharray": [2, 1.5],
                  }}
                />
                {selectedRouteId && (
                  <Layer
                    id="routes-selected"
                    type="line"
                    filter={["==", ["get", "routeId"], selectedRouteId]}
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": "#1C2321",
                      "line-width": 5,
                      "line-opacity": 0.9,
                    }}
                  />
                )}
              </Source>
            )}
          </MapGl>
        </div>
        <div className="mt-2 text-[11.5px] text-[#7E9182]">
          Click a route line to select it, then manage its closure in the
          service panel
        </div>
      </div>

      <div className="flex w-90 shrink-0 flex-col gap-3 max-xl:w-full">
        {feedback && (
          <div className="rounded-full border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1.5 text-[12.5px] text-[#15803D]">
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
                style={
                  selected.closure
                    ? { background: "#FEE2E2", color: "#991B1B" }
                    : { background: "#DCFCE7", color: "#166534" }
                }
              >
                {selected.closure ? "Closed" : "Open"}
              </span>
            </div>

            {selected.closure ? (
              <>
                <div className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12.5px] text-[#991B1B]">
                  {CLOSURE_REASON_LABELS[selected.closure.reason]}
                  {selected.closure.note && ` — ${selected.closure.note}`}
                  <div className="mt-0.5 text-[11.5px] opacity-75">
                    until {new Date(selected.closure.endsAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() =>
                    submitReopen(selected.closure!.id, selected.shortName)
                  }
                  disabled={isPending}
                  className="cursor-pointer self-start rounded-lg border border-[#86EFAC] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#15803D] hover:bg-[#F0FDF4] disabled:opacity-50"
                >
                  {isPending ? "Reopening…" : "Reopen route"}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
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
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                    From
                    <input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className="rounded-lg border border-[#D6DCD0] bg-white px-2 py-2 text-xs font-normal text-[#1C2321]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[#5C6B5E]">
                    Until
                    <input
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      className="rounded-lg border border-[#D6DCD0] bg-white px-2 py-2 text-xs font-normal text-[#1C2321]"
                    />
                  </label>
                </div>
                <button
                  onClick={submitClosure}
                  disabled={isPending}
                  className="cursor-pointer self-start rounded-lg border border-[#FCA5A5] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                >
                  {isPending ? "Closing…" : "Close route"}
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
                onClick={() => setSelectedRouteId(route.id)}
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
                  style={
                    route.closure
                      ? { background: "#FEE2E2", color: "#991B1B" }
                      : { background: "#DCFCE7", color: "#166534" }
                  }
                >
                  {route.closure ? "Closed" : "Open"}
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
    </div>
  );
}
