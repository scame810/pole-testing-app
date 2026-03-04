"use client";

import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useMemo, useRef, useState } from "react";

export type PolePoint = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  data?: Record<string, any>;
};

// ---- Fix missing marker icons in Next.js builds ----
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -36],
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPopupHtml(pole: Record<string, any>) {
  const id = pole["Pole ID"] ?? pole["PoleID"] ?? pole["id"] ?? "";

  const rows = Object.keys(pole)
    .map((k) => {
      const v = pole[k];
      if (v === null || v === undefined || String(v).trim() === "") return "";

      const key = escapeHtml(String(k));
      const valRaw = String(v);

      if (k === "Images" && /^https?:\/\//i.test(valRaw)) {
        const href = escapeHtml(valRaw);
        return `<tr>
          <td style="font-weight:600;padding:4px 6px;vertical-align:top;">${key}</td>
          <td style="padding:4px 6px;vertical-align:top;word-break:break-word;">
            <a href="${href}" target="_blank" rel="noreferrer">Open</a>
          </td>
        </tr>`;
      }

      const val = escapeHtml(valRaw);

      return `<tr>
        <td style="font-weight:600;padding:4px 6px;vertical-align:top;">${key}</td>
        <td style="padding:4px 6px;vertical-align:top;word-break:break-word;">${val}</td>
      </tr>`;
    })
    .filter(Boolean)
    .join("");

  return `
    <div style="max-width:340px;">
      <div style="font-weight:700;margin-bottom:6px;">Pole ID: ${escapeHtml(String(id))}</div>
      <div style="max-height:240px;overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function SelectedController({
  selectedId,
  points,
  markerRefs,
  clusterGroupRef,
}: {
  selectedId: string | null;
  points: PolePoint[];
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
  clusterGroupRef: React.MutableRefObject<any | null>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;

    const p = points.find((x) => x.id === selectedId);
    if (!p) return;

    const zoom = 19;

    // Push marker down based on map height so popup fits above
    const mapH = map.getSize().y;
    const yOffset = -Math.round(mapH * 0.32);

    map.flyTo([p.lat, p.lng], zoom, { duration: 0.8 });

    map.once("moveend", () => {
      map.panBy([0, yOffset], { animate: true });

      map.once("moveend", () => {
        const marker = markerRefs.current.get(selectedId);
        if (!marker) return;

        const clusterGroup = clusterGroupRef.current;

        // If marker is inside a cluster, expand to show it before opening popup
        if (clusterGroup?.zoomToShowLayer) {
          clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
        } else {
          marker.openPopup();
        }

        // slight extra nudge
        map.panBy([0, -40], { animate: true });
      });
    });
  }, [selectedId, points, map, markerRefs, clusterGroupRef]);

  return null;
}

function ClusterLayer({
  points,
  onSelect,
  markerRefs,
  clusterGroupRef,
}: {
  points: PolePoint[];
  onSelect: (id: string) => void;
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
  clusterGroupRef: React.MutableRefObject<any | null>;
}) {
  const map = useMap();

  // Keep onSelect stable so ClusterLayer doesn't rebuild every render
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const clusterGroup = (L as any).markerClusterGroup({
      chunkedLoading: true,
    });

    clusterGroupRef.current = clusterGroup;

    points.forEach((p) => {
      const marker = L.marker([p.lat, p.lng], { icon: DefaultIcon });

      marker.on("click", () => onSelectRef.current(p.id));

      const html = buildPopupHtml(p.data ?? { id: p.id, label: p.label, lat: p.lat, lng: p.lng });
      marker.bindPopup(html, { maxWidth: 360, autoPan: false });

      markerRefs.current.set(p.id, marker);
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      try {
        map.removeLayer(clusterGroup);
      } catch {
        // ignore
      }
      markerRefs.current.clear();
      clusterGroupRef.current = null;
    };
  }, [points, map, markerRefs, clusterGroupRef]);

  return null;
}

export default function PoleMap({
  points,
  selected,
  onSelect,
}: {
  points: PolePoint[];
  selected?: PolePoint | null;
  onSelect: (id: string) => void;
}) {
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  const clusterGroupRef = useRef<any | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Force a clean remount when dataset changes
  const mapKey = useMemo(() => {
    const first = points?.[0]?.id ?? "none";
    return `${points.length}-${first}`;
  }, [points]);

  const center: [number, number] =
    selected
      ? [selected.lat, selected.lng]
      : points.length
      ? [points[0].lat, points[0].lng]
      : [39, -98];

  if (!mounted) return <div className="w-full h-[500px]" />;

  return (
    <div className="w-full h-[500px]">
      <MapContainer key={mapKey} center={center} zoom={selected ? 16 : 5} className="w-full h-full">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClusterLayer
          points={points}
          onSelect={onSelect}
          markerRefs={markerRefs}
          clusterGroupRef={clusterGroupRef}
        />

        <SelectedController
          selectedId={selected?.id ?? null}
          points={points}
          markerRefs={markerRefs}
          clusterGroupRef={clusterGroupRef}
        />
      </MapContainer>
    </div>
  );
}