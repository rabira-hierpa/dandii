"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useShapeDrawStore } from "@/stores/shape-draw-store";

/**
 * The drawn line and its waypoints, while draw mode is active.
 *
 * Its own `Source`, deliberately: the routes source carries every shape in the
 * city, and re-serialising that FeatureCollection on every click would make
 * placing a waypoint cost more than snapping it.
 *
 * Snapped spans are solid blue (the map's selection colour — see DESIGN.md);
 * spans OTP couldn't route are amber and dashed. Colour alone would be a poor
 * distinction, so the dash carries the meaning and the toolbar carries a count.
 */

const SNAPPED_COLOR = "#1A73E8";
const UNSNAPPED_COLOR = "#B45309";

export const SHAPE_WAYPOINT_LAYER_ID = "shape-draw-waypoints";

export function ShapeDrawLayer() {
  const target = useShapeDrawStore((s) => s.target);
  const waypoints = useShapeDrawStore((s) => s.waypoints);
  const segments = useShapeDrawStore((s) => s.segments);

  const lines = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: segments.map((segment, index) => ({
        type: "Feature",
        id: index,
        properties: { straightLine: segment.straightLine },
        geometry: { type: "LineString", coordinates: segment.coordinates },
      })),
    }),
    [segments],
  );

  const points = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: waypoints.map((waypoint, index) => ({
        type: "Feature",
        id: index,
        properties: { index, label: String(index + 1) },
        geometry: { type: "Point", coordinates: [waypoint.lon, waypoint.lat] },
      })),
    }),
    [waypoints],
  );

  if (!target) return null;

  return (
    <>
      <Source id="shape-draft-lines" type="geojson" data={lines}>
        <Layer
          id="shape-draw-casing"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": "#FFFFFF",
            "line-width": 8,
            "line-opacity": 0.9,
          }}
        />
        <Layer
          id="shape-draw-snapped"
          type="line"
          filter={["!=", ["get", "straightLine"], true]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": SNAPPED_COLOR, "line-width": 4.5 }}
        />
        <Layer
          id="shape-draw-unsnapped"
          type="line"
          filter={["==", ["get", "straightLine"], true]}
          layout={{ "line-cap": "butt", "line-join": "round" }}
          paint={{
            "line-color": UNSNAPPED_COLOR,
            "line-width": 4.5,
            "line-dasharray": [2, 1.5],
          }}
        />
      </Source>

      <Source id="shape-draft-points" type="geojson" data={points}>
        {/* Invisible and generous: an 8px dot is a cruel right-click target. */}
        <Layer
          id={SHAPE_WAYPOINT_LAYER_ID}
          type="circle"
          paint={{ "circle-radius": 14, "circle-opacity": 0 }}
        />
        <Layer
          id="shape-draw-waypoint-dots"
          type="circle"
          paint={{
            "circle-radius": 6,
            "circle-color": "#FFFFFF",
            "circle-stroke-color": SNAPPED_COLOR,
            "circle-stroke-width": 2.5,
          }}
        />
        <Layer
          id="shape-draw-waypoint-labels"
          type="symbol"
          layout={{
            "text-field": ["get", "label"],
            "text-size": 10,
            "text-offset": [0, -1.4],
            "text-allow-overlap": true,
          }}
          paint={{
            "text-color": "#1C2321",
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 1.5,
          }}
        />
      </Source>
    </>
  );
}
