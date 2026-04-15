"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import MarkerClusterGroup from "react-leaflet-cluster";

export type PolePoint = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  data?: Record<string, any>;
};

function getPhiValue(data?: Record<string, any>): number | null {
  if (!data) return null;

  const raw =
    data["Pole Health Index(PHI)"] ??
    data["Pole Health/PHI"] ??
    data["PHI"] ??
    null;

  if (raw === null || raw === undefined || String(raw).trim() === "") return null;

  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function getMarkerColor(data?: Record<string, any>) {
  const phi = getPhiValue(data);

  if (phi === null) return "#2563eb";
  if (phi <= 69) return "#dc2626";
  if (phi <= 90) return "#eab308";
  return "#16a34a";
}

function makeColorIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: ${color};
        border: 2px solid white;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.35);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function SelectedController({
  selected,
  markerRefs,
}: {
  selected?: PolePoint | null;
  markerRefs: { current: Map<string, L.Marker> };
}) {
  const map = useMap();

  useEffect(() => {
    if (!selected) return;

    const marker = markerRefs.current.get(selected.id);

    map.setView([selected.lat, selected.lng], 18, { animate: false });

    if (marker) {
      marker.openPopup();
    }
  }, [map, selected, markerRefs]);

  return null;
}

function ResetViewController({
  resetViewTrigger,
}: {
  resetViewTrigger?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!resetViewTrigger) return;
    map.setView([39, -98], 5, { animate: false });
  }, [map, resetViewTrigger]);

  return null;
}

export default function PoleMap({
  points,
  selected,
  onSelect,
  resetViewTrigger = 0,
}: {
  points: PolePoint[];
  selected?: PolePoint | null;
  onSelect: (id: string) => void;
  resetViewTrigger?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  const center: [number, number] = useMemo(() => {
    if (points.length) return [points[0].lat, points[0].lng];
    return [39, -98];
  }, [points]);

  if (!mounted) {
    return <div className="w-full h-[500px]" />;
  }

  return (
    <div className="w-full h-[500px]">
      <MapContainer center={center} zoom={10} className="w-full h-full">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ResetViewController resetViewTrigger={resetViewTrigger} />
        <SelectedController selected={selected} markerRefs={markerRefs} />

        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={18}
          disableClusteringAtZoom={16}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
        >
          {points.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={makeColorIcon(getMarkerColor(p.data))}
              ref={(marker) => {
                if (marker) {
                  markerRefs.current.set(p.id, marker);
                } else {
                  markerRefs.current.delete(p.id);
                }
              }}
              eventHandlers={{
                click: () => onSelect(p.id),
              }}
            >
              <Popup autoPan={false} maxWidth={360}>
                <div style={{ maxWidth: 340 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 600, padding: "4px 6px" }}>
                          Pole ID
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          {p.id}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600, padding: "4px 6px" }}>
                          Date Tested
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          {String(p.data?.["Date Tested"] ?? "")}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600, padding: "4px 6px" }}>
                          Pole Health Index(PHI)
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          {String(p.data?.["Pole Health Index(PHI)"] ?? "")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}