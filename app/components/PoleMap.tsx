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

  if (phi === null) return "#2563eb"; // blue fallback
  if (phi < 80) return "#dc2626"; // red
  if (phi <= 94) return "#eab308"; // yellow
  return "#16a34a"; // green (95+)
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

function buildPopupHtml(pole: Record<string, any>, fieldOrder: string[] = []) {
  const id = pole["Pole ID"] ?? pole["PoleID"] ?? pole["id"] ?? "";

  const preferredKeys = fieldOrder.length
    ? fieldOrder
    : Object.keys(pole);

  const remainingKeys = Object.keys(pole).filter((k) => !preferredKeys.includes(k));

  const orderedKeys = [...preferredKeys, ...remainingKeys];

  const rows = orderedKeys
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
    const mapH = map.getSize().y;
    const yOffset = -Math.round(mapH * 0.32);

    map.flyTo([p.lat, p.lng], zoom, { duration: 0.8 });

    map.once("moveend", () => {
      map.panBy([0, yOffset], { animate: true });

      map.once("moveend", () => {
        const marker = markerRefs.current.get(selectedId);
        if (!marker) return;

        const clusterGroup = clusterGroupRef.current;

        if (clusterGroup?.zoomToShowLayer) {
          clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
        } else {
          marker.openPopup();
        }

        map.panBy([0, -40], { animate: true });
      });
    });
  }, [selectedId, points, map, markerRefs, clusterGroupRef]);

  return null;
}

function ZoomToAllController({
  points,
  trigger,
}: {
  points: PolePoint[];
  trigger: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, points, trigger]);

  return null;
}

function ClusterLayer({
  points,
  onSelect,
  markerRefs,
  clusterGroupRef,
  fieldOrder,
}: {
  points: PolePoint[];
  onSelect: (id: string) => void;
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
  clusterGroupRef: React.MutableRefObject<any | null>;
  fieldOrder: string[];
}) {
  const map = useMap();

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
      const markerColor = getMarkerColor(p.data);
      const marker = L.marker([p.lat, p.lng], {
        icon: makeColorIcon(markerColor),
      });

      marker.on("click", () => onSelectRef.current(p.id));

      const html = buildPopupHtml(
        p.data ?? { id: p.id, label: p.label, lat: p.lat, lng: p.lng },
        fieldOrder
      );
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
  zoomToAllTrigger = 0,
  fieldOrder = [],
}: {
  points: PolePoint[];
  selected?: PolePoint | null;
  onSelect: (id: string) => void;
  zoomToAllTrigger?: number;
  fieldOrder?: string[];
}) {
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  const clusterGroupRef = useRef<any | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mapKey = useMemo(() => {
    const first = points?.[0]?.id ?? "none";
    return `${points.length}-${first}`;
  }, [points]);

  const center: [number, number] = selected
    ? [selected.lat, selected.lng]
    : points.length
    ? [points[0].lat, points[0].lng]
    : [39, -98];

  if (!mounted) return <div className="w-full h-[500px]" />;

  return (
    <div className="w-full h-[500px]">
      <MapContainer
        key={mapKey}
        center={center}
        zoom={selected ? 16 : 5}
        className="w-full h-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClusterLayer
          points={points}
          onSelect={onSelect}
          markerRefs={markerRefs}
          clusterGroupRef={clusterGroupRef}
          fieldOrder={fieldOrder}
        />

        <SelectedController
          selectedId={selected?.id ?? null}
          points={points}
          markerRefs={markerRefs}
          clusterGroupRef={clusterGroupRef}
        />

        <ZoomToAllController points={points} trigger={zoomToAllTrigger} />
      </MapContainer>
    </div>
  );
}