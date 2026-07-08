"use client";

import { useState } from "react";
import { Marker } from "react-map-gl/maplibre";

interface BlueDotMarkerProps {
  longitude: number;
  latitude: number;
  label: string;
  /** Pulse ring for the active/origin location. */
  pulse?: boolean;
  /** Filled color; destination dots stay blue, origin uses the same. */
  color?: string;
  onClick?: () => void;
  /** Play a one-shot bounce (retriggered via key change by the parent). */
  bounce?: boolean;
}

/**
 * Google-Maps-style location dot: crisp blue core, white border, and a
 * semi-transparent pulse for the active point. Hover enlarges the dot and
 * reveals a tooltip; click recenters (parent) and bounces.
 */
export function BlueDotMarker({
  longitude,
  latitude,
  label,
  pulse = false,
  color = "#1A73E8",
  onClick,
  bounce = false,
}: BlueDotMarkerProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Marker longitude={longitude} latitude={latitude} anchor="center">
      <div
        role={onClick ? "button" : undefined}
        aria-label={label}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex cursor-pointer items-center justify-center"
        style={bounce ? { animation: "marker-bounce 0.6s ease-out" } : undefined}
      >
        {pulse && (
          <span
            className="absolute size-4.5 rounded-full"
            style={{
              background: color,
              animation: "blue-dot-pulse 2.2s ease-out infinite",
            }}
          />
        )}
        <span
          className="relative z-10 block size-4.5 rounded-full border-[2.5px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform duration-150"
          style={{
            background: color,
            transform: hovered ? "scale(1.25)" : "scale(1)",
          }}
        />
        {hovered && (
          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-lg bg-[#202124] px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap text-white shadow-lg">
            {label}
            <span className="absolute top-full left-1/2 -mt-px size-2 -translate-x-1/2 rotate-45 bg-[#202124]" />
          </div>
        )}
      </div>
    </Marker>
  );
}
