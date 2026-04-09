"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import MaintenancePolesTable from "./components/MaintenancePolesTable";

type CsvRow = Record<string, any>;

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

function toNumberOrNull(value: any): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function getDateTestedValue(row: Record<string, any>): string | null {
  const raw =
    row["Date Tested"] ??
    row["date tested"] ??
    row["Date"] ??
    null;

  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();
  if (!value) return null;

  const leadingDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (leadingDateMatch) return leadingDateMatch[1];

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function getPhiValue(row: Record<string, any>): number | null {
  const raw =
    row["Pole Health Index(PHI)"] ??
    row["Pole Health/PHI"] ??
    row["PHI"] ??
    null;

  if (raw === null || raw === undefined || String(raw).trim() === "") return null;

  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function getDisplayDate(value: any): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function getServerSortColumn(sortColumn: SortColumn): string {
  switch (sortColumn) {
    case "Pole ID":
      return "pole_id";
    case "Latitude":
      return "latitude";
    case "Longitude":
      return "longitude";
    case "Date Tested":
      return "date_tested";
    case "Pole Health Index(PHI)":
      return "phi";
    default:
      return "pole_id";
  }
}

export default function ReportsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const saveTimersRef = useRef<Record<string, any>>({});

  const [orgId, setOrgId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<"owner" | "member" | "viewer" | null>(null);

  const [maintenanceRows, setMaintenanceRows] = useState<MaintenancePoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const [selectedPoleId, setSelectedPoleId] = useState<string | null>(null);
  const [selectedPoleIds, setSelectedPoleIds] = useState<Record<string, boolean>>({});
  const [commentsByPole, setCommentsByPole] = useState<Record<string, string>>({});
  const [commentSaveStatus, setCommentSaveStatus] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});

  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [phiFilter, setPhiFilter] = useState<"all" | "lte69" | "70to89" | "gte90">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(10);

  const canUpload = activeRole === "owner";
  const canEditComments =
    activeRole === "owner" || activeRole === "member" || activeRole === "viewer";

  useEffect(() => {
    initialize();

    async function handleSelectedOrgChanged() {
      await initialize();
    }

    window.addEventListener("selected-org-changed", handleSelectedOrgChanged);

    return () => {
      window.removeEventListener("selected-org-changed", handleSelectedOrgChanged);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [phiFilter, dateFrom, dateTo, sortColumn, sortDirection, rowsPerPage]);

  async function initialize() {
    setLoading(true);
    setMessage("");

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setMessage("Could not load session.");
      setLoading(false);
      return;
    }

    const savedOrgId = window.localStorage.getItem("selectedOrgId");

    if (!savedOrgId) {
      setMessage("No customer selected.");
      setLoading(false);
      return;
    }

    setOrgId(savedOrgId);
    await loadActiveRole(savedOrgId);
    await loadMaintenanceRows(savedOrgId);
    setLoading(false);
  }

  async function loadActiveRole(currentOrgId: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user ?? null;
    if (!user) return;

    const { data, error } = await supabase
      .from("memberships")
      .select("role")
      .eq("org_id", currentOrgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Could not load role:", error);
      setActiveRole(null);
      return;
    }

    setActiveRole((data?.role ?? null) as "owner" | "member" | "viewer" | null);
  }

  async function loadMaintenanceRows(currentOrgId: string) {
    const { data, error } = await supabase
      .from("maintenance_poles")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      setMessage(`Could not load maintenance poles: ${error.message}`);
      return;
    }

    const rows = (data || []) as MaintenancePoleRow[];
    setMaintenanceRows(rows);

    const nextComments: Record<string, string> = {};
    for (const row of rows) {
      const key = row.pole_id ?? "";
      if (!key) continue;
      nextComments[key] = row.comments ?? "";
    }
    setCommentsByPole(nextComments);
  }

  async function handleMaintenanceCsvUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    if (!canUpload) {
      setMessage("Only the owner can upload maintenance CSVs.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    setMessage("");

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const parsedRows = results.data || [];

          const payload = parsedRows.map((row) => {
            const poleId =
              row["Pole ID"] ??
              row["PoleID"] ??
              row["Pole Id"] ??
              row["pole id"] ??
              row["pole_id"] ??
              null;

            const latitudeValue =
              row["Latitude"] ??
              row["Lat"] ??
              row["latitude"] ??
              row["lat"] ??
              null;

            const longitudeValue =
              row["Longitude"] ??
              row["Lng"] ??
              row["Long"] ??
              row["longitude"] ??
              row["lng"] ??
              row["long"] ??
              null;

            const dateTested = getDateTestedValue(row);
            const phi = getPhiValue(row);

            return {
              org_id: orgId,
              pole_id: poleId ? String(poleId).trim() : null,
              latitude: toNumberOrNull(latitudeValue),
              longitude: toNumberOrNull(longitudeValue),
              comments:
                row["Comments"] !== undefined && row["Comments"] !== null
                  ? String(row["Comments"])
                  : null,
              raw_data: row,
              date_tested: dateTested,
              phi,
            };
          });

          const cleanedPayload = payload.filter(
            (row) =>
              row.pole_id ||
              row.latitude !== null ||
              row.longitude !== null
          );

          if (cleanedPayload.length > 0) {
            const { error: upsertError } = await supabase
              .from("maintenance_poles")
              .upsert(cleanedPayload, { onConflict: "org_id,pole_id" });

            if (upsertError) {
              setMessage(`Upload failed: ${upsertError.message}`);
              setUploading(false);
              return;
            }
          }

          await loadMaintenanceRows(orgId);
          setMessage(`Uploaded ${cleanedPayload.length} maintenance rows.`);
        } catch (err: any) {
          setMessage(err?.message || "Upload failed.");
        } finally {
          setUploading(false);
          e.target.value = "";
        }
      },
      error: (err) => {
        setMessage(`CSV parse failed: ${err.message}`);
        setUploading(false);
        e.target.value = "";
      },
    });
  }

  function saveCommentToSupabase(poleId: string, comment: string) {
    if (!orgId) return;

    if (saveTimersRef.current[poleId]) {
      clearTimeout(saveTimersRef.current[poleId]);
    }

    setCommentSaveStatus((prev) => ({ ...prev, [poleId]: "saving" }));

    saveTimersRef.current[poleId] = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("maintenance_poles")
          .update({ comments: comment })
          .eq("org_id", orgId)
          .eq("pole_id", poleId);

        if (error) throw error;

        setCommentSaveStatus((prev) => ({ ...prev, [poleId]: "saved" }));

        setMaintenanceRows((prev) =>
          prev.map((row) =>
            row.pole_id === poleId ? { ...row, comments: comment } : row
          )
        );

        setTimeout(() => {
          setCommentSaveStatus((prev) => ({
            ...prev,
            [poleId]: prev[poleId] === "saved" ? "idle" : prev[poleId],
          }));
        }, 1500);
      } catch (e) {
        console.error("Save comment failed:", e);
        setCommentSaveStatus((prev) => ({ ...prev, [poleId]: "error" }));
      }
    }, 500);
  }

  const filteredRows = useMemo(() => {
    let rows = [...maintenanceRows];

    rows = rows.filter((row) => {
      const phi = getPhiValue(row.raw_data ?? {});
      const dateTested = getDateTestedValue(row.raw_data ?? {});

      if (phiFilter === "lte69" && !(phi !== null && phi <= 69)) return false;
      if (phiFilter === "70to89" && !(phi !== null && phi >= 70 && phi <= 89)) return false;
      if (phiFilter === "gte90" && !(phi !== null && phi >= 90)) return false;

      if (dateFrom && (!dateTested || dateTested < dateFrom)) return false;
      if (dateTo && (!dateTested || dateTested > dateTo)) return false;

      return true;
    });

    rows.sort((a, b) => {
      const ascending = sortDirection === "asc" ? 1 : -1;

      if (sortColumn === "Pole ID") {
        return String(a.pole_id ?? "").localeCompare(String(b.pole_id ?? "")) * ascending;
      }

      if (sortColumn === "Latitude") {
        return ((a.latitude ?? -Infinity) - (b.latitude ?? -Infinity)) * ascending;
      }

      if (sortColumn === "Longitude") {
        return ((a.longitude ?? -Infinity) - (b.longitude ?? -Infinity)) * ascending;
      }

      if (sortColumn === "Date Tested") {
        const aDate = getDateTestedValue(a.raw_data ?? {}) ?? "";
        const bDate = getDateTestedValue(b.raw_data ?? {}) ?? "";
        return aDate.localeCompare(bDate) * ascending;
      }

      if (sortColumn === "Pole Health Index(PHI)") {
        const aPhi = getPhiValue(a.raw_data ?? {}) ?? -Infinity;
        const bPhi = getPhiValue(b.raw_data ?? {}) ?? -Infinity;
        return (aPhi - bPhi) * ascending;
      }

      const serverSortKey = getServerSortColumn(sortColumn);
      if (serverSortKey === "pole_id") {
        return String(a.pole_id ?? "").localeCompare(String(b.pole_id ?? "")) * ascending;
      }

      return 0;
    });

    return rows;
  }, [maintenanceRows, phiFilter, dateFrom, dateTo, sortColumn, sortDirection]);

  const totalRows = filteredRows.length;
  const totalPages =
    rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const paginatedRows = useMemo(() => {
    if (rowsPerPage === "all") return filteredRows;
    const from = (currentPage - 1) * rowsPerPage;
    const to = from + rowsPerPage;
    return filteredRows.slice(from, to);
  }, [filteredRows, currentPage, rowsPerPage]);

  const selectedCount = Object.values(selectedPoleIds).filter(Boolean).length;

  const allCurrentPageSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every((row) => {
      const id = row.pole_id ?? "";
      return !!selectedPoleIds[id];
    });

  function exportRowsToCsv(rows: MaintenancePoleRow[], filename: string) {
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
    ];

    const exportRows = rows.map((row) => {
      const out: Record<string, any> = {};
      out["Pole ID"] = row.pole_id ?? "";
      out["Latitude"] = row.latitude ?? row.raw_data?.["Latitude"] ?? "";
      out["Longitude"] = row.longitude ?? row.raw_data?.["Longitude"] ?? "";

      for (const col of columns) {
        if (col === "Pole ID" || col === "Latitude" || col === "Longitude") continue;
        if (col === "Comments") {
          out[col] = commentsByPole[row.pole_id ?? ""] ?? row.comments ?? "";
        } else {
          out[col] = row.raw_data?.[col] ?? "";
        }
      }

      return out;
    });

    const csv = Papa.unparse(exportRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  const startRow =
    totalRows === 0 ? 0 : rowsPerPage === "all" ? 1 : (currentPage - 1) * rowsPerPage + 1;

  const endRow =
    rowsPerPage === "all" ? totalRows : Math.min(currentPage * rowsPerPage, totalRows);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Reports</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="bg-[#094929] text-white px-4 py-2 rounded-lg hover:bg-[#0c5a33] disabled:opacity-50"
              onClick={() => {
                const rows = filteredRows.filter((row) => !!selectedPoleIds[row.pole_id ?? ""]);
                if (rows.length === 0) return;
                exportRowsToCsv(rows, `selected-maintenance-poles-${new Date().toISOString().slice(0, 10)}.csv`);
              }}
              type="button"
              disabled={selectedCount === 0}
            >
              Export Selected ({selectedCount})
            </button>

            <button
              className="bg-[#094929] text-white px-4 py-2 rounded-lg hover:bg-[#0c5a33] disabled:opacity-50"
              onClick={() =>
                exportRowsToCsv(
                  filteredRows,
                  `maintenance-poles-${new Date().toISOString().slice(0, 10)}.csv`
                )
              }
              type="button"
              disabled={filteredRows.length === 0}
            >
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div>Loading reports...</div>
        ) : (
          <section className="rounded-xl border p-4 space-y-4 bg-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Maintenance Poles</h2>
              </div>

              {canUpload && (
                <label className="inline-flex cursor-pointer items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50">
                  {uploading ? "Uploading..." : "Upload CSV"}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleMaintenanceCsvUpload}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>

            {message && (
              <div className="rounded-md bg-gray-50 px-3 py-2 text-sm">
                {message}
              </div>
            )}

            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={phiFilter}
                  onChange={(e) =>
                    setPhiFilter(e.target.value as "all" | "lte69" | "70to89" | "gte90")
                  }
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <option value="all">All PHI</option>
                  <option value="lte69">PHI ≤ 69</option>
                  <option value="70to89">PHI 70–89</option>
                  <option value="gte90">PHI ≥ 90</option>
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">To</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPhiFilter("all");
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="rounded-md bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200"
                >
                  Clear Filters
                </button>
              </div>

              <div className="text-sm text-gray-500">
                Filtered results: {totalRows}
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span>
                  Showing {startRow} to {endRow} of {totalRows} rows
                </span>

                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRowsPerPage(value === "all" ? "all" : Number(value));
                  }}
                  className="rounded-md border px-2 py-1 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value="all">All</option>
                </select>

                <span>rows per page</span>
              </div>

              {rowsPerPage !== "all" && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

            <MaintenancePolesTable
              rows={paginatedRows}
              selectedPoleId={selectedPoleId}
              onSelectPole={setSelectedPoleId}
              selectedPoleIds={selectedPoleIds}
              setSelectedPoleIds={setSelectedPoleIds}
              allCurrentPageSelected={allCurrentPageSelected}
              commentsByPole={commentsByPole}
              commentSaveStatus={commentSaveStatus}
              canEditComments={canEditComments}
              onCommentChange={(poleId, next) => {
                setCommentsByPole((prev) => ({ ...prev, [poleId]: next }));
                saveCommentToSupabase(poleId, next);
              }}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={(column) => {
                if (sortColumn === column) {
                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                } else {
                  setSortColumn(column);
                  setSortDirection("asc");
                }
              }}
            />
          </section>
        )}
      </div>
    </>
  );
}