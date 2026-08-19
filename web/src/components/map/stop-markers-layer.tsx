"use client";

import { useLocale } from "next-intl";
import { Layer, Source } from "react-map-gl/maplibre";
import { localizedStopName } from "@/lib/stop-i18n";

export interface MapStop {
  id: string;
  name: string;
  /** Amharic display name, when one exists. */
  nameAm?: string | null;
  lat: number;
  lon: number;
}

function toFeatureCollection(
  stops: MapStop[],
  closedIds: ReadonlySet<string> | undefined,
  locale: string,
  extra?: Record<string, unknown>,
) {
  return {
    type: "FeatureCollection" as const,
    features: stops.map((stop, index) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [stop.lon, stop.lat],
      },
      properties: {
        stopId: stop.id,
        name: localizedStopName(stop, locale),
        index,
        closed: closedIds?.has(stop.id) ?? false,
        ...extra,
      },
    })),
  };
}

interface StopMarkersLayerProps {
  id: string;
  stops: MapStop[];
  /** Hub markers vs route-hover/selected markers. */
  variant: "hub" | "route";
  visible?: boolean;
  /** Larger markers with stronger halo when drawn over a thick route line. */
  onLine?: boolean;
  /** Stops temporarily out of service (partial/whole closure). */
  closedStopIds?: ReadonlySet<string>;
}

export function StopMarkersLayer({
  id,
  stops,
  variant,
  visible = true,
  onLine = false,
  closedStopIds,
}: StopMarkersLayerProps) {
  const locale = useLocale();
  if (!visible || stops.length === 0) return null;

  const data = toFeatureCollection(stops, closedStopIds, locale, { variant });
  const isHub = variant === "hub";
  const haloRadius = isHub ? 7 : onLine ? 12 : 9;
  const dotRadius = isHub ? 4.5 : onLine ? 6.5 : 5.5;
  const strokeWidth = isHub ? 1.5 : onLine ? 3 : 2;
  const openColor = isHub ? "#15803D" : "#152018";

  return (
    <Source id={`${id}-source`} type="geojson" data={data}>
      <Layer
        id={`${id}-halo`}
        type="circle"
        paint={{
          "circle-radius": haloRadius,
          "circle-color": "#FFFFFF",
          "circle-opacity": 1,
          "circle-stroke-width": onLine ? 1 : 0,
          "circle-stroke-color": "#E2E6DE",
        }}
      />
      <Layer
        id={`${id}-dot`}
        type="circle"
        paint={{
          "circle-radius": dotRadius,
          "circle-color": [
            "case",
            ["==", ["get", "closed"], true],
            "#EA580C",
            openColor,
          ],
          "circle-stroke-width": strokeWidth,
          "circle-stroke-color": "#FFFFFF",
        }}
      />
      <Layer
        id={`${id}-label`}
        type="symbol"
        layout={{
          "text-field": ["get", "name"],
          "text-size": isHub ? 11 : 10.5,
          "text-offset": [0, isHub ? 1.35 : 1.2],
          "text-anchor": "top",
          "text-max-width": 9,
          "text-font": ["Noto Sans Regular"],
          "text-allow-overlap": false,
          "text-optional": true,
        }}
        paint={{
          "text-color": [
            "case",
            ["==", ["get", "closed"], true],
            "#9A3412",
            "#1C2321",
          ],
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 1.5,
        }}
      />
    </Source>
  );
}
