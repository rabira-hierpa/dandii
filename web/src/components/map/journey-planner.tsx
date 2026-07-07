"use client";

import { useEffect, useRef, useState } from "react";
import { SearchLg } from "@untitledui/icons";
import { OPERATOR_META } from "@/lib/operators";
import { cx } from "@/utils/cx";
import type { OtpItinerary, StopSearchResult } from "./types";

const PLAN_QUERY = `
query Plan($fromLat: Float!, $fromLon: Float!, $toLat: Float!, $toLon: Float!) {
  plan(
    from: { lat: $fromLat, lon: $fromLon }
    to: { lat: $toLat, lon: $toLon }
    transportModes: [{ mode: WALK }, { mode: TRANSIT }]
    numItineraries: 3
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

function legColor(mode: string) {
  if (mode === "WALK") return "#9AA69C";
  if (mode === "TRAM" || mode === "RAIL") return OPERATOR_META.LRT.color;
  return OPERATOR_META.SHEGER.color;
}

function StopPicker({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: StopSearchResult | null;
  onSelect: (stop: StopSearchResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [fetchedResults, setFetchedResults] = useState<StopSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const results = query.trim().length < 2 ? [] : fetchedResults;

  useEffect(() => {
    if (query.trim().length < 2) return;
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setFetchedResults(data.stops ?? []);
      setOpen(true);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-[10.5px] font-semibold tracking-wide text-[#5C6B5E] uppercase">
        {label}
      </label>
      <input
        value={value ? value.name : query}
        onChange={(e) => {
          onSelect(null);
          setQuery(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search a stop…"
        className="w-full rounded-lg border border-[#D6DCD0] bg-white px-3 py-2 text-[13px] text-[#1C2321] focus:outline-2 focus:outline-[#15803D33]"
      />
      {open && results.length > 0 && !value && (
        <div className="absolute z-20 mt-1 flex max-h-52 w-full flex-col overflow-y-auto rounded-lg border border-[#E2E6DE] bg-white py-1 shadow-lg">
          {results.map((stop) => (
            <button
              key={stop.id}
              onClick={() => {
                onSelect(stop);
                setQuery("");
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-1.5 text-left text-[12.5px] text-[#1C2321] hover:bg-[#F4F5F2]"
            >
              {stop.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function JourneyPlanner({
  onItinerary,
}: {
  onItinerary: (itinerary: OtpItinerary | null) => void;
}) {
  const [from, setFrom] = useState<StopSearchResult | null>(null);
  const [to, setTo] = useState<StopSearchResult | null>(null);
  const [itineraries, setItineraries] = useState<OtpItinerary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    setItineraries([]);
    onItinerary(null);
    try {
      const res = await fetch("/api/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: PLAN_QUERY,
          variables: {
            fromLat: from.lat,
            fromLon: from.lon,
            toLat: to.lat,
            toLon: to.lon,
          },
        }),
      });
      const data = await res.json();
      const found: OtpItinerary[] = data?.data?.plan?.itineraries ?? [];
      if (found.length === 0) {
        setError(
          data?.error ?? "No itineraries found between these stops today.",
        );
      } else {
        setItineraries(found);
        setSelectedIndex(0);
        onItinerary(found[0]);
      }
    } catch {
      setError("Journey planner is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <StopPicker label="From" value={from} onSelect={setFrom} />
      <StopPicker label="To" value={to} onSelect={setTo} />
      <button
        onClick={plan}
        disabled={!from || !to || loading}
        className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#15803D] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0F5E2E] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SearchLg className="size-4" />
        {loading ? "Planning…" : "Plan trip"}
      </button>

      {error && <div className="text-[12.5px] text-[#B91C1C]">{error}</div>}

      {itineraries.length > 0 && (
        <div className="flex flex-col gap-2">
          {itineraries.map((itinerary, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedIndex(index);
                onItinerary(itinerary);
              }}
              className={cx(
                "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left",
                index === selectedIndex
                  ? "border-[#86B98F] bg-[#F3F8F1]"
                  : "border-[#E2E6DE] bg-white hover:bg-[#F8FAF6]",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[13.5px] font-bold text-[#1C2321]">
                  {formatDuration(itinerary.duration)}
                </span>
                <span className="text-[11.5px] text-[#5C6B5E]">
                  {formatTime(itinerary.startTime)} –{" "}
                  {formatTime(itinerary.endTime)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {itinerary.legs.map((leg, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-[10px] text-[#9AA69C]">›</span>
                    )}
                    <span
                      className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
                      style={{ background: legColor(leg.mode) }}
                    >
                      {leg.mode === "WALK"
                        ? `Walk ${Math.round(leg.distance)} m`
                        : (leg.route?.shortName ?? leg.mode)}
                    </span>
                  </span>
                ))}
              </div>
              <div className="text-[11.5px] text-[#5C6B5E]">
                {Math.round(itinerary.walkDistance)} m walking
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
