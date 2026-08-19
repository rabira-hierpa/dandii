"use client";

import { Layer, Source } from "react-map-gl/maplibre";
import type { PickedPoint } from "@/stores/stop-placement-store";

/**
 * The provisional marker for a stop that has been positioned but not created.
 *
 * It exists so the operator can see where the click landed before committing.
 * Drawn hollow and in the "operator edit" amber rather than the solid green of
 * a real stop, because until `createStop` succeeds this point is not on the
 * map for anybody else.
 */
export function PickedStopLayer({ point }: { point: PickedPoint | null }) {
  if (!point) return null;

  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lon, point.lat] },
        properties: {},
      },
    ],
  };

  return (
    <Source id="picked-stop-source" type="geojson" data={data}>
      <Layer
        id="picked-stop-halo"
        type="circle"
        paint={{
          "circle-radius": 13,
          "circle-color": "#F59E0B",
          "circle-opacity": 0.18,
        }}
      />
      <Layer
        id="picked-stop-dot"
        type="circle"
        paint={{
          "circle-radius": 6,
          "circle-color": "#FFFFFF",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#D97706",
        }}
      />
    </Source>
  );
}
