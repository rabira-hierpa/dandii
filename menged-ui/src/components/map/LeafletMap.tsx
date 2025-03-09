"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for Next.js bundling of Leaflet images
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

type LatLng = {
  lat: number;
  lng: number;
};

type LeafletMapProps = {
  fromPoint: LatLng;
  toPoint: LatLng;
  routePositions: [number, number][];
};

// Helper component to fit map bounds around markers
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map((p) => [p[0], p[1]]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, positions]);

  return null;
}

// Helper component to fix Leaflet icon issues
function LeafletMapSetup() {
  useEffect(() => {
    // @ts-expect-error - Leaflet typings issue
    delete L.Icon.Default.prototype._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: iconRetinaUrl.src,
      iconUrl: iconUrl.src,
      shadowUrl: shadowUrl.src,
    });
  }, []);

  return null;
}

export default function LeafletMap({
  fromPoint,
  toPoint,
  routePositions,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={[fromPoint.lat, fromPoint.lng]}
      zoom={13}
      style={{ height: "100%", width: "100%" }}
      className="z-0"
    >
      <LeafletMapSetup />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[fromPoint.lat, fromPoint.lng]}>
        <Popup>Starting Point</Popup>
      </Marker>
      <Marker position={[toPoint.lat, toPoint.lng]}>
        <Popup>Destination</Popup>
      </Marker>
      <Polyline
        positions={routePositions}
        pathOptions={{ color: "blue", weight: 4 }}
      />
      <FitBounds positions={routePositions} />
    </MapContainer>
  );
}
