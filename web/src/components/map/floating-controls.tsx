"use client";

import { useState } from "react";
import { LayersThree01, NavigationPointer01 } from "@untitledui/icons";
import { useMapStore } from "@/stores/map-store";

interface FloatingControlsProps {
  onLocate: (coords: { lat: number; lon: number }) => void;
}

/**
 * Right-side floating map controls (layers + my-location), positioned
 * above the bottom sheet on mobile like Google Maps.
 */
/** Visible sheet height per snap, mirrored from BottomSheet's fractions. */
const SHEET_DVH: Record<string, number> = {
  collapsed: 16,
  half: 45,
  full: 88,
};

export function FloatingControls({ onLocate }: FloatingControlsProps) {
  const { setLayersOpen, layersOpen, sheetSnap } = useMapStore();
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocate({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div
      className="absolute right-4 z-20 flex flex-col gap-2.5 transition-[bottom,opacity] duration-300 sm:top-16 sm:bottom-auto! sm:opacity-100! sm:pointer-events-auto!"
      style={{
        bottom: `calc(${SHEET_DVH[sheetSnap]}dvh + 1.25rem)`,
        opacity: sheetSnap === "full" ? 0 : 1,
        pointerEvents: sheetSnap === "full" ? "none" : "auto",
      }}
    >
      <button
        aria-label="Transit layers"
        onClick={() => setLayersOpen(!layersOpen)}
        className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white text-[#5F6368] shadow-[0_1px_4px_rgba(0,0,0,0.3)] hover:text-[#202124] active:scale-95"
      >
        <LayersThree01 className="size-5.5" />
      </button>
      <button
        aria-label="My location"
        onClick={locate}
        className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] active:scale-95"
      >
        {locating ? (
          <span className="size-4.5 animate-spin rounded-full border-2 border-[#DADCE0] border-t-[#1A73E8]" />
        ) : (
          <NavigationPointer01 className="size-5.5 text-[#1A73E8]" />
        )}
      </button>
    </div>
  );
}
