"use client";

import { useEffect, useRef, useState } from "react";
import type { Key } from "react-aria-components";
import { SwitchVertical01 } from "@untitledui/icons";
import { Select } from "@/components/base/select/select";
import type { SelectItemType } from "@/components/base/select/select-shared";
import { useMapStore } from "@/stores/map-store";
import { cx } from "@/utils/cx";
import {
  classifyItineraries,
  MODE_META,
  type ClassifiedItinerary,
  type ModeKey,
} from "./route-modes";
import type { OtpItinerary, StopSearchResult } from "./types";

/**
 * The OTP graph is transit-only (no OSM streets), so coordinate-based
 * planning fails with LOCATION_NOT_FOUND. Both endpoints are always transit
 * stops, so we plan stop-to-stop via GTFS ids ("1:" is OTP's feed id for a
 * single-feed graph); transfers fall back to straight-line walking.
 */
const PLAN_QUERY = `
query Plan($from: String!, $to: String!, $date: String, $time: String) {
  plan(
    fromPlace: $from
    toPlace: $to
    date: $date
    time: $time
    transportModes: [{ mode: WALK }, { mode: TRANSIT }]
    numItineraries: 5
  ) {
    itineraries {
      duration
      walkDistance
      startTime
      endTime
      legs {
        mode
        duration
        distance
        startTime
        endTime
        from { name }
        to { name }
        route { shortName longName }
        legGeometry { points }
      }
    }
  }
}`;

export interface DirectionsEndpoint extends StopSearchResult {
  isCurrentLocation?: boolean;
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const inputValue = value ? value.name : query;
  const items = !value && query.trim().length >= 2 ? fetched : [];

  useEffect(() => {
    if (value || query.trim().length < 2) return;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const stops = (data.stops ?? []) as StopSearchResult[];
      for (const stop of stops) stopsById.current.set(stop.id, stop);
      setFetched(stops.map((stop) => ({ id: stop.id, label: stop.name })));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, value]);

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
  results: ClassifiedItinerary[] | null;
  activeMode: ModeKey | null;
  onActiveMode: (mode: ModeKey) => void;
  onResults: (results: ClassifiedItinerary[] | null) => void;
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
  activeMode,
  onActiveMode,
  onResults,
  onEndpoints,
}: DirectionsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const setSheetSnap = useMapStore((s) => s.setSheetSnap);

  /**
   * Snap the user's position to the nearest transit stop (the street-less
   * OTP graph can only route between stops).
   */
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
          // Equirectangular approximation is plenty at city scale.
          const dLat = lat - latitude;
          const dLon = (lon - longitude) * Math.cos((latitude * Math.PI) / 180);
          const d = dLat * dLat + dLon * dLon;
          if (d < best) {
            best = d;
            nearest = {
              id: feature.properties?.stopId as string,
              name: `Your location · ${feature.properties?.name}`,
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

  const requestPlan = async (date?: string, time?: string) => {
    const res = await fetch("/api/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: PLAN_QUERY,
        variables: {
          from: `1:${from!.id}`,
          to: `1:${to!.id}`,
          date: date ?? null,
          time: time ?? null,
        },
      }),
    });
    const data = await res.json();
    return (data?.data?.plan?.itineraries ?? []) as OtpItinerary[];
  };

  const plan = async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    onResults(null);
    try {
      let found = await requestPlan();
      if (found.length === 0) {
        // Service may be over for today (roughly 05:00–22:00) — retry for
        // tomorrow morning in the network's timezone.
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        const date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Africa/Addis_Ababa",
        }).format(tomorrow);
        found = await requestPlan(date, "06:00");
        if (found.length > 0) {
          setNotice("Service has ended for today — showing tomorrow from 6:00.");
        }
      }
      if (found.length === 0) {
        setError("No routes found between these places.");
      } else {
        onResults(classifyItineraries(found));
        onActiveMode("fastest");
        onEndpoints({ from, to });
        setSheetSnap("half");
      }
    } catch {
      setError("Journey planner is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  const active = results?.find((r) => r.mode === activeMode) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* Endpoints */}
      <div className="relative flex flex-col gap-2">
        <EndpointInput
          placeholder="Choose start point"
          value={from}
          onSelect={setFrom}
          dotClass="border-[3px] border-[#1A73E8] bg-white"
        />
        <EndpointInput
          placeholder="Choose destination"
          value={to}
          onSelect={setTo}
          dotClass="bg-[#D93025]"
        />
        <button
          aria-label="Swap start and destination"
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
          Use my location
        </button>
        <button
          onClick={plan}
          disabled={!from || !to || loading}
          className="ml-auto cursor-pointer rounded-full bg-[#1A73E8] px-5 py-2 text-[13.5px] font-semibold text-white shadow-sm hover:bg-[#1765CC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Planning…" : "Directions"}
        </button>
      </div>

      {error && <div className="text-[13px] text-[#D93025]">{error}</div>}
      {notice && (
        <div className="rounded-lg bg-[#FEF7E0] px-3 py-2 text-[12.5px] text-[#B06000]">
          {notice}
        </div>
      )}

      {/* Mode cards — horizontal scrollable row */}
      {results && (
        <div className="scrollbar-hide -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
          {results.map((result) => {
            const meta = MODE_META[result.mode];
            const isActive = result.mode === activeMode;
            return (
              <button
                key={result.mode}
                onClick={() => onActiveMode(result.mode)}
                className={cx(
                  "w-40 shrink-0 cursor-pointer snap-start rounded-2xl border-2 p-3 text-left transition-colors",
                  isActive
                    ? "bg-white shadow-md"
                    : "border-transparent bg-[#F8F9FA] hover:bg-[#F1F3F4]",
                )}
                style={isActive ? { borderColor: meta.color } : undefined}
              >
                <div
                  className="text-[11px] font-bold tracking-wide uppercase"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </div>
                <div className="mt-1 text-[17px] font-bold text-[#202124]">
                  {formatDuration(result.itinerary.duration)}
                </div>
                <div className="text-[12px] text-[#5F6368]">
                  {result.mode === "cheapest"
                    ? `≈ ${result.fareEtb} ETB total`
                    : result.mode === "scenic"
                      ? `${(result.distanceMeters / 1000).toFixed(1)} km · ${result.places.length} places`
                      : `≈ ${result.fareEtb} ETB · ${(result.distanceMeters / 1000).toFixed(1)} km`}
                </div>
                <div className="mt-0.5 text-[11px] text-[#80868B]">
                  {meta.tagline}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Step-by-step directions for the active mode */}
      {active && (
        <div className="flex flex-col">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-[#202124]">
              {formatTime(active.itinerary.startTime)} –{" "}
              {formatTime(active.itinerary.endTime)}
            </span>
            <span className="text-[12px] text-[#5F6368]">
              {Math.round(active.itinerary.walkDistance)} m walking
            </span>
          </div>
          <ol className="flex flex-col">
            {active.itinerary.legs.map((leg, i) => {
              const isWalk = leg.mode === "WALK";
              const color = isWalk ? "#80868B" : MODE_META[active.mode].color;
              return (
                <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                  <span className="flex w-5 flex-col items-center">
                    <span
                      className="z-10 mt-1 size-3 rounded-full border-2 border-white shadow"
                      style={{ background: color }}
                    />
                    {i < active.itinerary.legs.length - 1 && (
                      <span
                        className={cx(
                          "w-0.5 flex-1",
                          isWalk ? "border-l-2 border-dotted border-[#BDC1C6]" : "",
                        )}
                        style={isWalk ? undefined : { background: color }}
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="text-[13.5px] font-medium text-[#202124]">
                      {isWalk
                        ? `Walk ${Math.round(leg.distance)} m`
                        : `${leg.route?.shortName ?? leg.mode} → ${leg.to.name}`}
                    </div>
                    <div className="text-[12px] text-[#5F6368]">
                      {formatTime(leg.startTime)} · {formatDuration(leg.duration)}
                      {!isWalk && leg.from.name ? ` · from ${leg.from.name}` : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
