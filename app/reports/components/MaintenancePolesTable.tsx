"use client";

import { useMemo } from "react";

type MaintenancePoleRow = {
  id: string;
  org_id: string;
  pole_id: string | null;
  latitude: number | null;
  longitude: number | null;
  comments: string | null;
  raw_data: Record<string, any> | null;
  uploaded_at: string;
};

type SortColumn = string | null;

const columns = [
  "Pole ID",
  "Latitude",
  "Longitude",
  "Date Tested",
  "Status",
  "Test Observations",
  "Pole Health Index(PHI)",
  "Foundation Health Index(FHI)",
  "RSV (%)",
  "Pole Length (ft)",
  "Measured Diameter (inches)",
  "Images",
  "OHMS",
  "Ground Rods",
  "OHMS Rod 1",
  "GW Repair",
  "Guy Markers",
  "Comments",
] as const;

function looksLikeUrl(s: string) {
  return /^https?:\/\/\S+/i.test(s) || /^www\.\S+/i.test(s);
}

function normalizeUrl(s: string) {
  const trimmed = s.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function getCellValue(row: MaintenancePoleRow, column: string) {
  if (column === "Pole ID") return row.pole_id ?? "";
  if (column === "Latitude") return row.latitude ?? row.raw_data?.["Latitude"] ?? "";
  if (column === "Longitude") return row.longitude ?? row.raw_data?.["Longitude"] ?? "";
  if (column === "Comments") return row.comments ?? row.raw_data?.["Comments"] ?? "";
  return row.raw_data?.[column] ?? "";
}

function getSortValue(row: MaintenancePoleRow, column: string) {
  const value = getCellValue(row, column);

  if (column === "Date Tested") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  const numericColumns = [
    "Latitude",
    "Longitude",
    "Pole Health Index(PHI)",
    "Foundation Health Index(FHI)",
    "RSV (%)",
    "Pole Length (ft)",
    "Measured Diameter (inches)",
    "OHMS",
    "Ground Rods",
    "OHMS Rod 1",
  ];

  if (numericColumns.includes(column)) {
    const n = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }

  return String(value ?? "").toLowerCase().trim();
}

function getStatus(row: MaintenancePoleRow) {
  return String(
    row.raw_data?.["Status"] ??
      row.raw_data?.["status"] ??
      row.raw_data?.["STATUS"] ??
      ""
  )
    .trim()
    .toLowerCase();
}

export default function MaintenancePolesTable({
  rows,
  selectedPoleId,
  onSelectPole,
  selectedPoleIds,
  setSelectedPoleIds,
  allCurrentPageSelected,
  commentsByPole,
  commentSaveStatus,
  canEditComments,
  onCommentChange,
  sortColumn,
  sortDirection,
  onSort,
}: {
  rows: MaintenancePoleRow[];
  selectedPoleId: string | null;
  onSelectPole: (poleId: string | null) => void;
  selectedPoleIds: Record<string, boolean>;
  setSelectedPoleIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  allCurrentPageSelected: boolean;
  commentsByPole: Record<string, string>;
  commentSaveStatus: Record<string, "idle" | "saving" | "saved" | "error">;
  canEditComments: boolean;
  onCommentChange: (poleId: string, next: string) => void;
  sortColumn: SortColumn;
  sortDirection: "asc" | "desc";
  onSort: (column: SortColumn) => void;
}) {
  const maintenanceRows = useMemo(() => {
    const filtered = rows.filter(
      (row) => getStatus(row) === "maintenance needed"
    );

    if (!sortColumn) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a, sortColumn);
      const bVal = getSortValue(b, sortColumn);

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortDirection === "asc" ? 1 : -1;
      if (bVal === null) return sortDirection === "asc" ? -1 : 1;

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortColumn, sortDirection]);

  if (!maintenanceRows.length) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-600">
        No poles marked Maintenance needed yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto max-h-[700px] overflow-y-auto rounded-lg border border-gray-300">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-gray-200">
          <tr>
            <th className="border border-gray-300 px-4 py-3 whitespace-nowrap">
              <input
                type="checkbox"
                checked={allCurrentPageSelected}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelectedPoleIds((prev) => {
                    const next = { ...prev };
                    for (const row of maintenanceRows) {
                      const id = row.pole_id ?? "";
                      if (id) next[id] = checked;
                    }
                    return next;
                  });
                }}
              />
            </th>

            {columns.map((column) => {
              const sortable = true;

              return (
                <th
                  key={column}
                  className={
                    "border border-gray-300 px-4 py-3 text-left font-semibold whitespace-nowrap " +
                    (sortable ? "cursor-pointer select-none hover:bg-gray-300" : "")
                  }
                  onClick={() => onSort(column)}
                >
                  {column}
                  {sortColumn === column && (
                    <span className="ml-1">
                      {sortDirection === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {maintenanceRows.map((row, idx) => {
            const poleId = row.pole_id ?? "";

            return (
              <tr
                key={row.id}
                onClick={() => onSelectPole(poleId || null)}
                className={
                  "cursor-pointer transition-colors " +
                  (poleId === selectedPoleId
                    ? "bg-yellow-100 ring-2 ring-inset ring-yellow-400"
                    : idx % 2 === 0
                    ? "bg-white"
                    : "bg-gray-50")
                }
              >
                <td
                  className="border border-gray-300 px-4 py-3 align-top"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedPoleIds[poleId]}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectedPoleIds((prev) => ({
                        ...prev,
                        [poleId]: checked,
                      }));
                    }}
                  />
                </td>

                {columns.map((column) => {
                  if (column === "Comments") {
                    const value = commentsByPole[poleId] ?? row.comments ?? "";
                    const saveState = commentSaveStatus[poleId] ?? "idle";

                    return (
                      <td
                        key={column}
                        className="border border-gray-300 px-4 py-3 align-top min-w-[220px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mb-1 text-xs">
                          {saveState === "saving" && (
                            <span className="text-amber-600 font-medium">Saving...</span>
                          )}
                          {saveState === "saved" && (
                            <span className="text-[#094929] font-medium">Saved</span>
                          )}
                          {saveState === "error" && (
                            <span className="text-red-600 font-medium">Save failed</span>
                          )}
                        </div>

                        {canEditComments ? (
                          <textarea
                            value={value}
                            onChange={(e) => onCommentChange(poleId, e.target.value)}
                            placeholder="Add notes..."
                            className="w-full min-h-[60px] p-2 border rounded-md text-sm"
                          />
                        ) : (
                          <div className="w-full min-h-[60px] p-2 border rounded-md text-sm bg-gray-50 whitespace-pre-wrap">
                            {value || ""}
                          </div>
                        )}
                      </td>
                    );
                  }

                  const raw = getCellValue(row, column);
                  const value = String(raw ?? "");
                  const isImageLink = column === "Images" && looksLikeUrl(value);

                  return (
                    <td
                      key={column}
                      className="border border-gray-300 px-4 py-3 align-top whitespace-nowrap"
                    >
                      {isImageLink ? (
                        <a
                          href={normalizeUrl(value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open Photos
                        </a>
                      ) : (
                        value || "-"
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}