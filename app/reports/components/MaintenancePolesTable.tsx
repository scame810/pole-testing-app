"use client";

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

type SortColumn =
  | "Pole ID"
  | "Latitude"
  | "Longitude"
  | "Date Tested"
  | "Pole Health Index(PHI)"
  | null;

const columns = [
  "Pole ID",
  "Latitude",
  "Longitude",
  "Date Tested",
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
  if (!rows.length) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-600">
        No maintenance pole data uploaded yet.
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
                    for (const row of rows) {
                      const id = row.pole_id ?? "";
                      if (id) next[id] = checked;
                    }
                    return next;
                  });
                }}
              />
            </th>

            {columns.map((column) => {
              const sortable =
                column === "Pole ID" ||
                column === "Latitude" ||
                column === "Longitude" ||
                column === "Date Tested" ||
                column === "Pole Health Index(PHI)";

              return (
                <th
                  key={column}
                  className={
                    "border border-gray-300 px-4 py-3 text-left font-semibold whitespace-nowrap " +
                    (sortable ? "cursor-pointer select-none hover:bg-gray-300" : "")
                  }
                  onClick={() => {
                    if (sortable) onSort(column as SortColumn);
                  }}
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
          {rows.map((row, idx) => {
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