"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react-aria-components";
import { SwitchVertical01 } from "@untitledui/icons";
import { useLocale, useTranslations } from "next-intl";
import { Select } from "@/components/base/select/select";
import type { SelectItemType } from "@/components/base/select/select-shared";
import { OPERATOR_CODES, OPERATOR_META, type OperatorCode } from "@/lib/operators";
import { ga } from "@/lib/gtag";
import { localizedStopName } from "@/lib/stop-i18n";
import { useMapStore } from "@/stores/map-store";
import { cx } from "@/utils/cx";
import type { DirectRoute, StopSearchResult, TransferJourney } from "./types";

export interface DirectionsEndpoint extends StopSearchResult {
  isCurrentLocation?: boolean;
}

function formatMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function EndpointInput({
  placeholder,
  value,
  onSelect,
  dotClass,
}: {
  placeholder: string;
  value: DirectionsEndpoint | null;
  onSelect: (stop: DirectionsEndpoint | null) => void;
  dotClass: string;
}) {
  const [query, setQuery] = useState("");
  const [fetched, setFetched] = useState<SelectItemType[]>([]);
  const stopsById = useRef(new Map<string, StopSearchResult>());
  const locale = useLocale();
  const inputValue = value ? localizedStopName(value, locale) : query;
  // react-aria ComboBox requires selectedKey to exist inside `items`. When a
  // stop is selected the collection must be exactly that item — filtering it
  // out (e.g. `[]`) makes react-aria clear the field on the next render, which
  // wiped one endpoint whenever the user typed in the other.
  const items: SelectItemType[] = value
    ? [{ id: value.id, label: localizedStopName(value, locale) }]
    : query.trim().length >= 2
      ? fetched
      : [];

  useEffect(() => {
    if (value || query.trim().length < 2) return;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const stops = (data.stops ?? []) as StopSearchResult[];
      for (const stop of stops) stopsById.current.set(stop.id, stop);
      setFetched(
        stops.map((stop) => ({ id: stop.id, label: localizedStopName(stop, locale) })),
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [query, value, locale]);

  return (
    <div className="flex items-center gap-2.5">
      <span className={cx("size-2.5 shrink-0 rounded-full", dotClass)} />
      <div className="min-w-0 flex-1">
        <Select.ComboBox
          aria-label={placeholder}
          shortcut={false}
          size="sm"
          placeholder={placeholder}
          inputValue={inputValue}
          onInputChange={(next) => {
            if (value) onSelect(null);
            setQuery(next);
          }}
          selectedKey={value?.id ?? null}
          onSelectionChange={(key: Key | null) => {
            if (key == null) {
              onSelect(null);
              return;
            }
            const stop = stopsById.current.get(String(key));
            if (!stop) return;
            onSelect(stop);
            setQuery("");
          }}
          items={items}
          allowsEmptyCollection
        >
          {(item) => <Select.Item id={item.id} label={item.label} />}
        </Select.ComboBox>
      </div>
    </div>
  );
}

interface DirectionsPanelProps {
  /**
   * Endpoint state lives in the parent: this panel renders twice (mobile
   * sheet + desktop panel), so local state would diverge between mounts.
   */
  from: DirectionsEndpoint | null;
  to: DirectionsEndpoint | null;
  setFrom: (stop: DirectionsEndpoint | null) => void;
  setTo: (stop: DirectionsEndpoint | null) => void;
  results: DirectRoute[] | null;
  fallback: TransferJourney[] | null;
  operators: Set<OperatorCode>;
  onToggleOperator: (code: OperatorCode) => void;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
  selectedJourneyId: string | null;
  onSelectJourney: (id: string) => void;
  onResults: (results: DirectRoute[] | null) => void;
  onFallback: (journeys: TransferJourney[] | null) => void;
  onEndpoints: (
    endpoints: { from: DirectionsEndpoint; to: DirectionsEndpoint } | null,
  ) => void;
}

export function DirectionsPanel({
  from,
  to,
  setFrom,
  setTo,
  results,
  fallback,
  operators,
  onToggleOperator,
  selectedRouteId,
  onSelectRoute,
  selectedJourneyId,
  onSelectJourney,
  onResults,
  onFallback,
  onEndpoints,
}: DirectionsPanelProps) {
  const t = useTranslations("directions");
  const tMap = useTranslations("map");
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSheetSnap = useMapStore((s) => s.setSheetSnap);

  /** Snap the user's position to the nearest transit stop. */
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const res = await fetch("/api/geo/stops");
        const data: GeoJSON.FeatureCollection = await res.json();
        let nearest: DirectionsEndpoint | null = null;
        let best = Infinity;
        for (const feature of data.features) {
          const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          const dLat = lat - latitude;
          const dLon = (lon - longitude) * Math.cos((latitude * Math.PI) / 180);
          const d = dLat * dLat + dLon * dLon;
          if (d < best) {
            best = d;
            nearest = {
              id: feature.properties?.stopId as string,
              // Both halves were English: a hardcoded prefix and the stop's
              // Latin name, even for an Amharic reader.
              name: `${tMap("myLocation")} · ${localizedStopName(
                {
                  name: feature.properties?.name as string,
                  nameAm: feature.properties?.nameAm as string | null,
                },
                locale,
              )}`,
              lat,
              lon,
              isCurrentLocation: true,
            };
          }
        }
        if (nearest) setFrom(nearest);
      } catch {
        // Ignore; the user can still pick a start stop manually.
      }
    });
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const plan = async () => {
    if (!from || !to) return;
    ga.directionsRequest(from.id, to.id);
    setLoading(true);
    setError(null);
    onResults(null);
    onFallback(null);
    try {
      const params = new URLSearchParams({ from: from.id, to: to.id });
      const res = await fetch(`/api/directions?${params}`);
      const data = await res.json();
      const direct = (data?.direct ?? []) as DirectRoute[];
      const journeys = (data?.fallback ?? []) as TransferJourney[];
      onResults(direct);
      onFallback(journeys);
      onEndpoints({ from, to });
      if (direct.length > 0) onSelectRoute(direct[0].routeId);
      else if (journeys.length > 0) onSelectJourney(journeys[0].id);
      setSheetSnap("half");
    } catch {
      setError(t("unavailable"));
    } finally {
      setLoading(false);
    }
  };

  // Client-side agency filter over the already-ranked results (no refetch).
  const visible = useMemo(() => {
    if (!results) return null;
    if (operators.size === 0) return results;
    return results.filter((r) => r.operator && operators.has(r.operator.code));
  }, [results, operators]);

  const visibleFallback = useMemo(() => {
    if (!fallback) return null;
    if (operators.size === 0) return fallback;
    return fallback.filter(
      (j) => j.primaryOperator && operators.has(j.primaryOperator.code),
    );
  }, [fallback, operators]);

  // Keep a valid selection as the filter changes.
  useEffect(() => {
    if (visible && visible.length > 0) {
      if (!visible.some((r) => r.routeId === selectedRouteId)) {
        onSelectRoute(visible[0].routeId);
      }
    } else if (visibleFallback && visibleFallback.length > 0) {
      if (!visibleFallback.some((j) => j.id === selectedJourneyId)) {
        onSelectJourney(visibleFallback[0].id);
      }
    }
  }, [
    visible,
    visibleFallback,
    selectedRouteId,
    selectedJourneyId,
    onSelectRoute,
    onSelectJourney,
  ]);

  const hasAny =
    (results && results.length > 0) || (fallback && fallback.length > 0);
  const countFor = (code: OperatorCode) =>
    results && results.length > 0
      ? results.filter((r) => r.operator?.code === code).length
      : (fallback ?? []).filter((j) => j.primaryOperator?.code === code).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Endpoints */}
      <div className="relative flex flex-col gap-2">
        <EndpointInput
          placeholder={t("chooseStart")}
          value={from}
          onSelect={setFrom}
          dotClass="border-[3px] border-[#1A73E8] bg-white"
        />
        <EndpointInput
          placeholder={t("chooseDestination")}
          value={to}
          onSelect={setTo}
          dotClass="bg-[#D93025]"
        />
        <button
          aria-label={t("swap")}
          onClick={swap}
          className="absolute top-1/2 -right-1 -translate-y-1/2 cursor-pointer rounded-full p-2 text-[#5F6368] hover:bg-[#F1F3F4]"
        >
          <SwitchVertical01 className="size-4.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={useMyLocation}
          className="cursor-pointer rounded-full border border-[#DADCE0] px-3 py-1.5 text-[12.5px] font-medium text-[#1A73E8] hover:bg-[#F8FBFF]"
        >
          {t("useMyLocation")}
        </button>
        <button
          onClick={plan}
          disabled={!from || !to || loading}
          className="ml-auto cursor-pointer rounded-full bg-[#1A73E8] px-5 py-2 text-[13.5px] font-semibold text-white shadow-sm hover:bg-[#1765CC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? t("planning") : t("getDirections")}
        </button>
      </div>

      {/* Agency filter — narrows the ranked results by operator. */}
      {hasAny && (
        <div className="flex flex-wrap gap-1.5">
          {OPERATOR_CODES.map((code) => {
            const meta = OPERATOR_META[code];
            const active = operators.has(code);
            const count = countFor(code);
            if (count === 0 && !active) return null;
            return (
              <button
                key={code}
                onClick={() => onToggleOperator(code)}
                aria-pressed={active}
                className={cx(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  active
                    ? "border-transparent text-white"
                    : "border-[#DADCE0] text-[#3D4A3F] hover:bg-[#F4F5F2]",
                )}
                style={active ? { background: meta.color } : undefined}
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    background: active ? "rgba(255,255,255,0.9)" : meta.color,
                  }}
                />
                {meta.short}
                <span className={cx("tabular-nums", active ? "opacity-90" : "text-[#80868B]")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="text-[13px] text-[#D93025]">{error}</div>}

      {/* Nothing at all — neither a direct route nor a transfer journey. */}
      {results &&
        results.length === 0 &&
        (!fallback || fallback.length === 0) &&
        !loading && (
          <div className="rounded-xl bg-[#F8F9FA] px-3 py-4 text-center text-[13px] text-[#5F6368]">
{t("noRoute")}
          </div>
        )}

      {/* Operator-ranked direct-route cards. */}
      {visible && visible.length > 0 && (
        <div className="flex flex-col gap-2">
          {visible.map((route) => (
            <DirectRouteCard
              key={route.routeId}
              route={route}
              active={route.routeId === selectedRouteId}
              onClick={() => onSelectRoute(route.routeId)}
            />
          ))}
        </div>
      )}

      {/* Transfer journeys (OTP) — only when no direct route exists. */}
      {(!results || results.length === 0) &&
        visibleFallback &&
        visibleFallback.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-[#5F6368] uppercase">
              {t("requiresTransfer")}
            </div>
            {visibleFallback.map((journey) => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                active={journey.id === selectedJourneyId}
                onClick={() => onSelectJourney(journey.id)}
              />
            ))}
          </div>
        )}
    </div>
  );
}

function JourneyCard({
  journey,
  active,
  onClick,
}: {
  journey: TransferJourney;
  active: boolean;
  onClick: () => void;
}) {
  const color = journey.primaryOperator?.color ?? "#5F6368";
  const transitLegs = journey.legs.filter((l) => l.mode !== "WALK");
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex cursor-pointer flex-col gap-1.5 rounded-2xl border-2 p-3 text-left transition-colors",
        active
          ? "bg-white shadow-md"
          : "border-transparent bg-[#F8F9FA] hover:bg-[#F1F3F4]",
      )}
      style={active ? { borderColor: color } : undefined}
    >
      <div className="flex items-center gap-1.5">
        {transitLegs.map((leg, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[#9AA0A6]">→</span>}
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold text-white"
              style={{ background: leg.operator?.color ?? "#5F6368" }}
            >
              {leg.routeShortName ?? leg.mode}
            </span>
          </span>
        ))}
        <span className="ml-auto text-[16px] font-bold text-[#202124]">
          {formatMinutes(journey.totalSecs)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-[#5F6368]">
        <span>
          {journey.transfers} transfer{journey.transfers === 1 ? "" : "s"}
        </span>
        {journey.walkMeters > 0 && (
          <>
            <span>·</span>
            <span>{journey.walkMeters} m walk</span>
          </>
        )}
        {journey.fareEtb != null && (
          <span className="ml-auto font-semibold text-[#202124]">
            ≈ {journey.fareEtb} ETB
          </span>
        )}
      </div>
    </button>
  );
}

function DirectRouteCard({
  route,
  active,
  onClick,
}: {
  route: DirectRoute;
  active: boolean;
  onClick: () => void;
}) {
  const color = route.operator?.color ?? "#5F6368";
  const walk = route.walkToBoardMeters + route.walkFromAlightMeters;
  const headwayMin = Math.round((route.waitSecs * 2) / 60);
  const locale = useLocale();
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex cursor-pointer flex-col gap-1.5 rounded-2xl border-2 p-3 text-left transition-colors",
        active ? "bg-white shadow-md" : "border-transparent bg-[#F8F9FA] hover:bg-[#F1F3F4]",
      )}
      style={active ? { borderColor: color } : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold text-white"
          style={{ background: color }}
        >
          {route.shortName}
        </span>
        {route.operator && (
          <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color }}>
            {route.operator.name}
          </span>
        )}
        {route.closed && (
          <span className="rounded-full bg-[#FCE8E6] px-1.5 py-0.5 text-[10px] font-bold text-[#C5221F] uppercase">
            Closed
          </span>
        )}
        <span className="ml-auto text-[16px] font-bold text-[#202124]">
          {formatMinutes(route.totalSecs)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[12.5px] text-[#3C4043]">
        <span className="min-w-0 truncate font-medium">
          {localizedStopName(route.board, locale)}
        </span>
        <span className="text-[#9AA0A6]">→</span>
        <span className="min-w-0 truncate font-medium">
          {localizedStopName(route.alight, locale)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-[#5F6368]">
        <span>{formatMinutes(route.inVehicleSecs)} ride</span>
        <span>·</span>
        <span>{route.numStops} stops</span>
        {walk > 0 && (
          <>
            <span>·</span>
            <span>{walk} m walk</span>
          </>
        )}
        <span>·</span>
        <span>every ~{headwayMin} min</span>
        {route.fareEtb != null && (
          <span className="ml-auto font-semibold text-[#202124]">
            ≈ {route.fareEtb} ETB
          </span>
        )}
      </div>

      {/* Stop-by-stop list, shown when this result is selected. */}
      {active && route.stops.length > 0 && (
        <ol className="mt-1 flex flex-col border-t border-[#EEF1EA] pt-2">
          {route.stops.map((stop, i) => {
            const isFirst = i === 0;
            const isLast = i === route.stops.length - 1;
            const dotColor = isFirst ? "#1A73E8" : isLast ? "#D93025" : "#BDC1C6";
            return (
              <li key={`${stop.id}-${i}`} className="flex items-stretch gap-2.5">
                <span className="flex w-3 flex-col items-center">
                  {!isFirst && <span className="h-1.5 w-0.5 bg-[#DADCE0]" />}
                  <span
                    className="size-2.5 shrink-0 rounded-full border-2 border-white"
                    style={{ background: dotColor, boxShadow: "0 0 0 1px #DADCE0" }}
                  />
                  {!isLast && <span className="w-0.5 flex-1 bg-[#DADCE0]" />}
                </span>
                <span
                  className={cx(
                    "py-0.5 text-[12px]",
                    isFirst || isLast
                      ? "font-semibold text-[#202124]"
                      : "text-[#5F6368]",
                  )}
                >
                  {localizedStopName(stop, locale)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </button>
  );
}
