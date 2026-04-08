"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { inviteMember } from "@/app/actions/inviteMember";
import AppShell from "./components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const PoleMap = dynamic(() => import("./components/PoleMap"), { ssr: false });

type Row = Record<string, any>;

const POLE_ID_KEYS = ["Pole ID", "PoleID", "Pole Id", "pole id", "pole_id"];
const LAT_KEYS = ["Latitude", "Lat", "latitude", "lat"];
const LNG_KEYS = ["Longitude", "Lng", "Long", "longitude", "lng", "long"];

function isCsvFile(file: File) {
  return file.name.toLowerCase().endsWith(".csv");
}

function getPoleId(row: Row): string | null {
  for (const k of POLE_ID_KEYS) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

function getNumber(value: any): number | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim().replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

type PolePoint = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  data?: Record<string, any>;
};

function looksLikeUrl(s: string) {
  return /^https?:\/\/\S+/i.test(s) || /^www\.\S+/i.test(s) || /onedrive\.live\.com|1drv\.ms/i.test(s);
}

function normalizeUrl(s: string) {
  const trimmed = s.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/onedrive\.live\.com|1drv\.ms/i.test(trimmed)) {
    return `https://${trimmed.replace(/^\/\//, "")}`;
  }
  return trimmed;
}

function getPageNumbers(current: number, total: number): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }

  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, "...", current - 1, current, current + 1, "...", total];
}

function stripProtectedColumns(row: Row): Row {
  const copy = { ...row };
  delete copy["Comments"];
  delete copy["comments"];
  return copy;
}

function getDateTestedValue(row: Row): string | null {
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

function getPhiValue(row: Row): number | null {
  const raw =
    row["Pole Health Index(PHI)"] ??
    row["Pole Health/PHI"] ??
    row["PHI"] ??
    null;

  if (raw === null || raw === undefined || String(raw).trim() === "") return null;

  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function getServerSortColumn(sortColumn: string | null): string {
  if (!sortColumn) return "pole_id";

  switch (sortColumn) {
    case "Pole ID":
      return "pole_id";
    case "Latitude":
      return "latitude";
    case "Longitude":
      return "longitude";
    case "Pole Health Index(PHI)":
      return "phi";
    case "Date Tested":
      return "date_tested";
    default:
      return "pole_id";
  }
}

function buildMapPopupData(row: Row): Row {
  return {
    "Pole ID": row["Pole ID"] ?? "",
    "Latitude": row["Latitude"] ?? "",
    "Longitude": row["Longitude"] ?? "",
    "Date Tested": row["Date Tested"] ?? "",
    "Test Observations": row["Test Observations"] ?? "",
    "Pole Health Index(PHI)": row["Pole Health Index(PHI)"] ?? "",
    "Foundation Health Index(FHI)": row["Foundation Health Index(FHI)"] ?? "",
    "RSV (%)": row["RSV (%)"] ?? "",
    "Pole Length (ft)": row["Pole Length (ft)"] ?? "",
    "Measured Diameter (inches)": row["Measured Diameter (inches)"] ?? "",
    "Images": row["Images"] ?? "",
    "OHMS": row["OHMS"] ?? "",
    "Ground Rods": row["Ground Rods"] ?? "",
    "OHMS Rod 1": row["OHMS Rod 1"] ?? "",
    "GW Repair": row["GW Repair"] ?? "",
    "Guy Markers": row["Guy Markers"] ?? "",
    "Comments": row["Comments"] ?? "",
  };
}

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [status, setStatus] = useState<string>("");
  const [selectedPoleId, setSelectedPoleId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [commentsByPole, setCommentsByPole] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(10);
  const [supabaseStatus, setSupabaseStatus] = useState("not run");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [selectedPoleIds, setSelectedPoleIds] = useState<Record<string, boolean>>({});
  const [ownerOrgs, setOwnerOrgs] = useState<{ org_id: string; name?: string }[]>([]);
  const [activeRole, setActiveRole] = useState<"owner" | "member" | "viewer" | null>(null);
  const [activeOrgName, setActiveOrgName] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [phiFilter, setPhiFilter] = useState<"all" | "lte69" | "70to89" | "gte90">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [tableRows, setTableRows] = useState<Row[]>([]);
  const [tableTotalRows, setTableTotalRows] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [importSummary, setImportSummary] = useState("");
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [mapRows, setMapRows] = useState<Row[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [dateTo, setDateTo] = useState("");
  const [showImportSummary, setShowImportSummary] = useState(false);
  const [importSummaryData, setImportSummaryData] = useState<{
    title: string;
    lines: string[];
  } | null>(null);
  const saveTimersRef = useRef<Record<string, any>>({});

  const isOwner = activeRole === "owner";
  const isMember = activeRole === "member";
  const isViewer = activeRole === "viewer";
  const roleLabel = isOwner ? "Owner" : isMember ? "Member" : isViewer ? "Viewer" : "No role";

  const canImport = activeRole === "owner";
  const canEditComments = activeRole === "owner" || activeRole === "member";
  const [commentSaveStatus, setCommentSaveStatus] = useState<
    Record<string, "idle" | "saving" | "saved" | "error">
  >({});
  const [poleSearch, setPoleSearch] = useState("");
  const [zoomToAllTrigger, setZoomToAllTrigger] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      const path = window.location.pathname;

      // allow auth callback + password reset pages
      const allowUnauthed =
        path.startsWith("/auth/callback") ||
        path.startsWith("/update-password");

      if (!session && !allowUnauthed) {
        router.replace("/login");
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const path = window.location.pathname;

      const allowUnauthed =
        path.startsWith("/auth/callback") ||
        path.startsWith("/update-password");

      if (!session && !allowUnauthed) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  function validateMainRows(rows: Row[]) {
    const errors: string[] = [];

    if (rows.length === 0) errors.push("CSV appears empty.");

    const missingId = rows.filter((r) => !getPoleId(r)).length;
    if (missingId) errors.push(`${missingId} rows are missing Pole ID.`);

    let badCoords = 0;
    for (const r of rows) {
      const id = getPoleId(r);
      if (!id) continue;

      const latKey = LAT_KEYS.find((k) => r?.[k] !== undefined);
      const lngKey = LNG_KEYS.find((k) => r?.[k] !== undefined);
      if (!latKey || !lngKey) continue;

      const lat = getNumber(r[latKey]);
      const lng = getNumber(r[lngKey]);
      if (lat === null || lng === null) badCoords++;
    }

    if (badCoords) errors.push(`${badCoords} rows have invalid Latitude/Longitude.`);

    return errors;
  }

  function saveCommentToSupabase(poleId: string, comment: string) {
    if (saveTimersRef.current[poleId]) clearTimeout(saveTimersRef.current[poleId]);

    setCommentSaveStatus((prev) => ({ ...prev, [poleId]: "saving" }));

    saveTimersRef.current[poleId] = setTimeout(async () => {
      try {
        if (!activeOrgId) throw new Error("No activeOrgId selected");

        const { error } = await supabase
          .from("poles")
          .update({ comments: comment })
          .eq("org_id", activeOrgId)
          .eq("pole_id", poleId);

        if (error) throw error;

        setCommentsByPole((prev) => ({ ...prev, [poleId]: comment }));
        setCommentSaveStatus((prev) => ({ ...prev, [poleId]: "saved" }));

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

  async function goToPoleInTable(poleId: string) {
    if (!activeOrgId || !poleId) return;

    try {
      const sortKey = getServerSortColumn(sortColumn);
      const ascending = sortDirection === "asc";

      let query = supabase
        .from("poles")
        .select("pole_id", { count: "exact" })
        .eq("org_id", activeOrgId);

      if (phiFilter === "lte69") query = query.lte("phi", 69);
      if (phiFilter === "70to89") query = query.gte("phi", 70).lte("phi", 89);
      if (phiFilter === "gte90") query = query.gte("phi", 90);

      if (dateFrom) query = query.gte("date_tested", dateFrom);
      if (dateTo) query = query.lte("date_tested", dateTo);

      const { data, error } = await query.order(sortKey, { ascending });

      if (error) throw error;

      const index = (data ?? []).findIndex((r: any) => r.pole_id === poleId);
      if (index === -1) return;

      if (rowsPerPage === "all") return;

      const page = Math.floor(index / rowsPerPage) + 1;
      if (page !== currentPage) {
        setCurrentPage(page);
      }
    } catch (e) {
      console.error("goToPoleInTable failed:", e);
    }
  }

  async function mergeOhmsToSupabase(rows: Row[]) {
    const ohmsAliases: Record<string, string[]> = {
      "OHMS": ["OHMS"],
      "Ground Rods": ["Ground Rods", "GroundRods"],
      "OHMS Rod 1": ["OHMS Rod 1", "OHMS Rod1", "OHMS ROD 1", "OHMS rod 1"],
      "GW Repair": ["GW Repair", "GWRepair"],
      "Guy Markers": ["Guy Markers", "GuyMarkers"],
    };
    const byId = new Map<string, Record<string, any>>();

    for (const r of rows) {
      const pole_id = getPoleId(r);
      if (!pole_id) continue;

      const patch: Record<string, any> = {};

      for (const [canonical, aliases] of Object.entries(ohmsAliases)) {
        const foundKey = aliases.find((key) => r?.[key] !== undefined);
        if (!foundKey) continue;

        const v = r[foundKey];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          patch[canonical] = v;
        }
      }

      for (const [k, v] of Object.entries(r)) {
        if (POLE_ID_KEYS.includes(k)) continue;
        if (v === undefined || v === null || String(v).trim() === "") continue;
        patch[k] = v;
      }

      byId.set(pole_id, { ...(byId.get(pole_id) ?? {}), ...patch });
    }

    const poleIds = Array.from(byId.keys());
    if (poleIds.length === 0) return { count: 0 };
    if (!activeOrgId) throw new Error("No activeOrgId selected");

    const { data: existing, error: readErr } = await supabase
      .from("poles")
      .select("pole_id, data")
      .eq("org_id", activeOrgId)
      .in("pole_id", poleIds);

    if (readErr) throw readErr;

    const existingMap = new Map<string, any>();
    for (const row of existing ?? []) existingMap.set(row.pole_id, row.data ?? {});

    const mergedPayload = poleIds.map((pole_id) => ({
      pole_id,
      org_id: activeOrgId,
      data: { ...(existingMap.get(pole_id) ?? {}), ...(byId.get(pole_id) ?? {}) },
    }));

    const { error: upsertErr } = await supabase
      .from("poles")
      .upsert(mergedPayload as any[], { onConflict: "org_id,pole_id" });

    if (upsertErr) throw upsertErr;

    return { count: mergedPayload.length };
  }

  async function loadActiveOrg(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user ?? null;
    if (!user) return null;

    const savedOrgId = window.localStorage.getItem("selectedOrgId");

    const { data: mems, error: mErr } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id);

    if (mErr) throw mErr;

    const membershipOrgIds = (mems ?? []).map((m: any) => m.org_id);

    if (savedOrgId && membershipOrgIds.includes(savedOrgId)) {
      setActiveOrgId(savedOrgId);
      return savedOrgId;
    }

    const firstOrg = membershipOrgIds[0] ?? null;
    setActiveOrgId(firstOrg);

    if (firstOrg) {
      window.localStorage.setItem("selectedOrgId", firstOrg);
    }

    return firstOrg;
  }

  async function loadPolesFromSupabase(orgId: string) {
    setSupabaseStatus("loading poles...");

    const { data, error } = await supabase
      .from("poles")
      .select("pole_id, latitude, longitude, data, comments")
      .eq("org_id", orgId)
      .limit(2000);

    if (error) {
      console.log("Load poles error:", error);
      setSupabaseStatus(`error: ${error.message}`);
      return;
    }

    const nextComments: Record<string, string> = {};

    const rows: Row[] = (data ?? []).map((r: any) => {
      if (r.comments !== undefined && r.comments !== null && String(r.comments).trim() !== "") {
        nextComments[r.pole_id] = String(r.comments);
      }

      return {
        "Pole ID": r.pole_id,
        Latitude: r.latitude,
        Longitude: r.longitude,
        ...(r.data ?? {}),
        Comments: r.comments ?? "",
      };
    });

    setCommentsByPole(nextComments);
    setSupabaseStatus(`ok (loaded: ${rows.length})`);
  }

  async function loadTablePage(orgId: string) {
    if (!orgId) return;

    setTableLoading(true);

    try {
      const pageSize = rowsPerPage === "all" ? 5000 : rowsPerPage;
      const from = rowsPerPage === "all" ? 0 : (currentPage - 1) * rowsPerPage;
      const to = rowsPerPage === "all" ? pageSize - 1 : from + rowsPerPage - 1;

      let query = supabase
        .from("poles")
        .select("pole_id, latitude, longitude, phi, date_tested, data, comments", {
          count: "exact",
        })  
        .eq("org_id", orgId);

      if (phiFilter === "lte69") query = query.lte("phi", 69);
      if (phiFilter === "70to89") query = query.gte("phi", 70).lte("phi", 89);
      if (phiFilter === "gte90") query = query.gte("phi", 90);

      if (dateFrom) query = query.gte("date_tested", dateFrom);
      if (dateTo) query = query.lte("date_tested", dateTo);

      const sortKey = getServerSortColumn(sortColumn);
      query = query.order(sortKey, { ascending: sortDirection === "asc" });

      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const nextComments: Record<string, string> = {};
      const rows: Row[] = (data ?? []).map((r: any) => {
        if (r.comments !== undefined && r.comments !== null && String(r.comments).trim() !== "") {
          nextComments[r.pole_id] = String(r.comments);
        }

        return {
          "Pole ID": r.pole_id,
          Latitude: r.latitude,
          Longitude: r.longitude,
          ...(r.data ?? {}),
          Comments: r.comments ?? "",
        };
      });

      setCommentsByPole((prev) => ({ ...prev, ...nextComments }));
      setTableRows(rows);
      setTableTotalRows(count ?? rows.length);
        } catch (e) {
          console.error("loadTablePage failed:", e);
        } finally {
          setTableLoading(false);
          setLastRefresh(new Date().toLocaleTimeString());
        }
      }

  async function loadMapRows(orgId: string) {
    if (!orgId) return;

    setMapLoading(true);

    try {
      let query = supabase
        .from("poles")
        .select("pole_id, latitude, longitude, phi, date_tested, data, comments")
        .eq("org_id", orgId)
        .limit(10000);

      if (phiFilter === "lte69") query = query.lte("phi", 69);
      if (phiFilter === "70to89") query = query.gte("phi", 70).lte("phi", 89);
      if (phiFilter === "gte90") query = query.gte("phi", 90);

      if (dateFrom) query = query.gte("date_tested", dateFrom);
      if (dateTo) query = query.lte("date_tested", dateTo);

      const { data, error } = await query;

      if (error) throw error;

      const rows: Row[] = (data ?? []).map((r: any) => ({
        "Pole ID": r.pole_id,
        Latitude: r.latitude,
        Longitude: r.longitude,
        ...(r.data ?? {}),
        Comments: r.comments ?? "",
      }));

      setMapRows(rows);
    } catch (e) {
      console.error("loadMapRows failed:", e);
    } finally {
      setMapLoading(false);
    }
  }

  async function loadOwnerOrgs() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user ?? null;
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("memberships")
      .select("org_id, orgs(name)")
      .eq("user_id", user.id)
      .eq("role", "owner");

    if (error) throw error;

    return (data ?? []).map((m: any) => ({
      org_id: m.org_id,
      name: m.orgs?.name,
    }));
  }

  async function loadActiveRole(orgId: string) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user ?? null;
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const role = (data?.role ?? null) as "owner" | "member" | "viewer" | null;
    setActiveRole(role);
    return role;
  }

  useEffect(() => {
    async function initializeDashboard() {
      try {
        const orgId = await loadActiveOrg();
        if (!orgId) {
          setSupabaseStatus("No org selected (activeOrgId is null)");
          return;
        }

        const owners = await loadOwnerOrgs();
        setOwnerOrgs(owners);

        const active = owners.find((o) => o.org_id === orgId);
        if (active) {
          setActiveOrgName(active.name ?? active.org_id);
        } else {
          setActiveOrgName(orgId);
        }

        await loadActiveRole(orgId);
        await loadPolesFromSupabase(orgId);
        await loadTablePage(orgId);
        await loadMapRows(orgId);
      } catch (e: any) {
        console.error("Error loading org:", e);

        const msg =
          e?.message ||
          e?.error?.message ||
          e?.details ||
          (typeof e === "string" ? e : JSON.stringify(e));

        setSupabaseStatus(`Error loading org: ${msg}`);
      }
    }

    initializeDashboard();

    async function handleSelectedOrgChanged() {
      await initializeDashboard();
    }

    window.addEventListener("selected-org-changed", handleSelectedOrgChanged);

    return () => {
      window.removeEventListener("selected-org-changed", handleSelectedOrgChanged);
    };
  }, [supabase]);

  async function upsertPolesToSupabase(rows: Row[]) {
    if (!activeOrgId) throw new Error("No activeOrgId selected");

    const byId = new Map<string, any>();
    for (const r of rows) {
      const pole_id = getPoleId(r);
      if (!pole_id) continue;

      const latKey = LAT_KEYS.find((k) => r?.[k] !== undefined);
      const lngKey = LNG_KEYS.find((k) => r?.[k] !== undefined);

      const latitude = getNumber(latKey ? r[latKey] : null);
      const longitude = getNumber(lngKey ? r[lngKey] : null);
      const phi = getPhiValue(r);
      const date_tested = getDateTestedValue(r);

      byId.set(pole_id, {
        pole_id,
        org_id: activeOrgId,
        latitude,
        longitude,
        phi,
        date_tested,
        data: r,
      });
    }

    const payload = Array.from(byId.values());
    if (payload.length === 0) return { count: 0 };

    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("poles")
        .upsert(slice, { onConflict: "org_id,pole_id" });
      if (error) throw error;
    }

    return { count: payload.length };
  }

  const exportCombinedCsv = async () => {
    if (!activeOrgId) return;

    try {
      const pageSize = 1000;
      let from = 0;
      let allRows: Row[] = [];

      while (true) {
        let query = supabase
          .from("poles")
          .select("pole_id, latitude, longitude, phi, date_tested, data, comments")
          .eq("org_id", activeOrgId);

        if (phiFilter === "lte69") query = query.lte("phi", 69);
        if (phiFilter === "70to89") query = query.gte("phi", 70).lte("phi", 89);
        if (phiFilter === "gte90") query = query.gte("phi", 90);

        if (dateFrom) query = query.gte("date_tested", dateFrom);
        if (dateTo) query = query.lte("date_tested", dateTo);

        const sortKey = getServerSortColumn(sortColumn);
        query = query.order(sortKey, { ascending: sortDirection === "asc" });

        const { data, error } = await query.range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        const rows: Row[] = data.map((r: any) => ({
          "Pole ID": r.pole_id,
          Latitude: r.latitude,
          Longitude: r.longitude,
          ...(r.data ?? {}),
          Comments: r.comments ?? "",
        }));

        allRows = [...allRows, ...rows];

        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (allRows.length === 0) return;

      const ordered = allRows.map((r) => {
        const out: Record<string, any> = {};
        for (const h of tableHeaders) out[h] = (r as any)?.[h] ?? "";
        return out;
      });

      const csv = Papa.unparse(ordered);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `pole-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    }
  };

  const exportSelectedCsv = async () => {
    if (!activeOrgId) return;

    const selectedIds = Object.keys(selectedPoleIds).filter((id) => selectedPoleIds[id]);
    if (selectedIds.length === 0) return;

    try {
      const pageSize = 1000;
      let allRows: Row[] = [];

      for (let i = 0; i < selectedIds.length; i += pageSize) {
        const idChunk = selectedIds.slice(i, i + pageSize);

        let query = supabase
          .from("poles")
          .select("pole_id, latitude, longitude, phi, date_tested, data, comments")
          .eq("org_id", activeOrgId)
          .in("pole_id", idChunk);

        if (phiFilter === "lte69") query = query.lte("phi", 69);
        if (phiFilter === "70to89") query = query.gte("phi", 70).lte("phi", 89);
        if (phiFilter === "gte90") query = query.gte("phi", 90);

        if (dateFrom) query = query.gte("date_tested", dateFrom);
        if (dateTo) query = query.lte("date_tested", dateTo);

        const { data, error } = await query;

        if (error) throw error;

        const rows: Row[] = (data ?? []).map((r: any) => ({
          "Pole ID": r.pole_id,
          Latitude: r.latitude,
          Longitude: r.longitude,
          ...(r.data ?? {}),
          Comments: r.comments ?? "",
        }));

        allRows = [...allRows, ...rows];
      }

      if (allRows.length === 0) return;

      const selectedOrder = new Map(selectedIds.map((id, index) => [id, index]));
      allRows.sort((a, b) => {
        const aId = getPoleId(a) ?? "";
        const bId = getPoleId(b) ?? "";
        return (selectedOrder.get(aId) ?? 0) - (selectedOrder.get(bId) ?? 0);
      });

      const ordered = allRows.map((r) => {
        const out: Record<string, any> = {};
        for (const h of tableHeaders) out[h] = (r as any)?.[h] ?? "";
        return out;
      });

      const csv = Papa.unparse(ordered);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `selected-poles-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Selected export failed:", e);
    }
  };

  const selectedCount = Object.values(selectedPoleIds).filter(Boolean).length;

  const totalRows = tableTotalRows;
  const totalPages =
    rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const paginatedRows = tableRows;

  const startRow =
    totalRows === 0 ? 0 : rowsPerPage === "all" ? 1 : (currentPage - 1) * rowsPerPage + 1;

  const endRow =
    rowsPerPage === "all" ? totalRows : Math.min(currentPage * rowsPerPage, totalRows);

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const points = useMemo<PolePoint[]>(() => {
    return mapRows
      .map((r) => {
        const id = getPoleId(r);
        if (!id) return null;

        const latKey = LAT_KEYS.find((k) => r?.[k] !== undefined);
        const lngKey = LNG_KEYS.find((k) => r?.[k] !== undefined);

        const lat = getNumber(latKey ? r[latKey] : null);
        const lng = getNumber(lngKey ? r[lngKey] : null);

        if (lat === null || lng === null) return null;

        return {
          id,
          lat,
          lng,
          label: String(r["Pole ID"] ?? id),
          data: buildMapPopupData(r),  
        };
      })
      .filter(Boolean) as PolePoint[];
  }, [mapRows]);

  const filteredPoints = useMemo(() => {
    const q = poleSearch.trim().toLowerCase();
    if (!q) return points;

    return points.filter((p) => {
      const id = p.id.toLowerCase();
      const label = String(p.label ?? "").toLowerCase();
      return id.includes(q) || label.includes(q);
    });
  }, [points, poleSearch]);

  const selectedPoint = useMemo(
    () => filteredPoints.find((p) => p.id === selectedPoleId) ?? null,
    [filteredPoints, selectedPoleId]
  );

  useEffect(() => {
    if (!selectedPoleId || !tableContainerRef.current) return;

    const row = tableContainerRef.current.querySelector<HTMLTableRowElement>(
      `tr[data-pole-id="${selectedPoleId}"]`
    );

    if (row) {
      row.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedPoleId, paginatedRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortColumn, sortDirection, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [phiFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!activeOrgId) return;
    loadTablePage(activeOrgId);
  }, [
    activeOrgId,
    currentPage,
    rowsPerPage,
    sortColumn,
    sortDirection,
    phiFilter,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    if (!activeOrgId) return;
    loadMapRows(activeOrgId);
  }, [activeOrgId, phiFilter, dateFrom, dateTo]);

  const tableHeaders = useMemo(() => {
    if (tableRows.length === 0) return [];

    const preferred = [
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

    const all = new Set<string>();
    for (const r of tableRows) Object.keys(r || {}).forEach((k) => all.add(k));

    POLE_ID_KEYS.filter((k) => k !== "Pole ID").forEach((k) => all.delete(k));

    const out: string[] = [];
    const used = new Set<string>();

    for (const h of preferred) {
      if (!used.has(h)) {
        used.add(h);
        out.push(h);
      }
    }

    const rest = Array.from(all)
      .filter((k) => !used.has(k))
      .sort();

    out.push(...rest);

    if (!out.includes("Comments")) out.push("Comments");

    return out;
  }, [tableRows]);

  const handleMainCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!canImport) {
      setStatus("Only the owner can import CSVs.");
      event.target.value = "";
      return;
    }

    if (!isCsvFile(file)) {
      alert("Please upload a .csv file (Save As → CSV UTF-8 in Excel).");
      event.target.value = "";
      return;
    }

    setStatus("Reading main CSV...");

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => {
        const cleaned = h.trim();
        if (!cleaned) return "_empty";
        return cleaned.replace(/\s+/g, " ");
      },
      complete: async (results) => {
        const rows = (results.data || [])
          .map((r) => stripProtectedColumns(r))
          .filter((r) =>
            Object.values(r || {}).some((v) => String(v ?? "").trim() !== "")
          );

        const errors = validateMainRows(rows);
        if (errors.length) {
          setStatus("CSV errors: " + errors.join(" "));
          event.target.value = "";
          return;
        }

        try {
          setStatus(`Main CSV parsed: ${rows.length} rows. Saving to Supabase...`);

          const res = await upsertPolesToSupabase(rows);

          setStatus(`Saved ${res.count} poles to Supabase. Reloading...`);
          if (!activeOrgId) throw new Error("No activeOrgId selected");
          await loadPolesFromSupabase(activeOrgId);
          await loadTablePage(activeOrgId);
          await loadMapRows(activeOrgId);

          setStatus(`Done. Saved ${res.count} poles.`);
          setImportSummary(`Imported ${res.count} poles`);
          setImportSummaryData({
            title: "Main CSV Import Complete",
            lines: [
              `Imported ${res.count} poles`,
              `Organization: ${activeOrgName || activeOrgId || "Unknown"}`,
            ],
          });
          setShowImportSummary(true);
          setSelectedPoleId(null);
          event.target.value = "";
        } catch (e: any) {
          console.error(e);
          setStatus(`Supabase save error: ${JSON.stringify(e, null, 2)}`);
          event.target.value = "";
        }
      },
    });
  };

  const handleOHMSCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!canImport) {
      setStatus("Only the owner can import CSVs.");
      event.target.value = "";
      return;
    }

    if (!isCsvFile(file)) {
      alert("Please upload a .csv file (Save As → CSV UTF-8 in Excel).");
      event.target.value = "";
      return;
    }

    setStatus("Reading OHMS CSV...");

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => {
        const cleaned = h.trim();
        if (!cleaned) return "_empty";
        return cleaned.replace(/\s+/g, " ");
      },
      complete: async (results) => {
        const rows = (results.data || [])
          .map((r) => stripProtectedColumns(r))
          .filter((r) =>
            Object.values(r || {}).some((v) => String(v ?? "").trim() !== "")
          );

        (async () => {
          try {
            setStatus(`OHMS CSV parsed: ${rows.length} rows. Saving to Supabase...`);
            const res = await mergeOhmsToSupabase(rows);
            setStatus(`Saved OHMS for ${res.count} poles. Reloading...`);
            if (!activeOrgId) throw new Error("No activeOrgId selected");
            await loadPolesFromSupabase(activeOrgId);
            await loadTablePage(activeOrgId);
            await loadMapRows(activeOrgId);
            setStatus(`Done. Updated OHMS for ${res.count} poles.`);
            setImportSummary(`Updated OHMS for ${res.count} poles`);
            setImportSummaryData({
              title: "OHMS CSV Import Complete",
              lines: [
                `Updated OHMS for ${res.count} poles`,
                `Organization: ${activeOrgName || activeOrgId || "Unknown"}`,
              ],
            });
            setShowImportSummary(true);
            event.target.value = "";
          } catch (e: any) {
            console.error("OHMS save error full:", e);
            const msg =
              e?.message || e?.error?.message || (typeof e === "string" ? e : JSON.stringify(e));
            setStatus(`Supabase OHMS save error: ${msg}`);
            event.target.value = "";
          }
        })();

      },
      error: (err) => {
        console.error(err);
        alert("Could not read that CSV. Try saving as CSV UTF-8 and re-uploading.");
        setStatus("");
        event.target.value = "";
      },
    });
  };

  const clearAll = () => {
    setSelectedPoleId(null);
    setStatus("");
    setCommentsByPole({});
    setCommentSaveStatus({});
    setTableRows([]);
    setTableTotalRows(0);
    setMapRows([]);
  };
  const allCurrentPageSelected =
  paginatedRows.length > 0 &&
  paginatedRows.every((row) => {
    const id = getPoleId(row) ?? "";
    return !!selectedPoleIds[id];
  });

  return (
  <AppShell>
    <div className="min-h-screen bg-gray-100 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">Pole Testing Dashboard</h1>

            {!isOwner && (
              <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                {roleLabel}
              </span>
            )}
          </div>

          {isOwner && activeOrgName && (
            <div className="mb-4 rounded-lg border border-[#094929] bg-[#e6f4ec] px-4 py-2 text-sm font-semibold text-[#094929]">
              Active Organization: {activeOrgName}
            </div>
          )}

          {isOwner && (
            <div className="text-sm text-gray-500">
              Supabase status: <b>{supabaseStatus}</b>
              {importSummary && (
                <span className="ml-4 text-gray-600">| {importSummary}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isOwner && (
            <span className="rounded-md bg-[#e6f4ec] px-2.5 py-1 text-xs font-semibold text-[#094929]">
              {roleLabel}
            </span>
          )}

          <button
            className="bg-[#094929] text-white px-4 py-2 rounded-lg hover:bg-[#0c5a33] disabled:opacity-50"
            onClick={exportSelectedCsv}
            type="button"
            disabled={selectedCount === 0}
          >
            Export Selected ({selectedCount})
          </button>

          <button
            className="bg-[#094929] text-white px-4 py-2 rounded-lg hover:bg-[#0c5a33] disabled:opacity-50"
            onClick={exportCombinedCsv}
            type="button"
            disabled={tableRows.length === 0}
          >
            Export CSV
          </button>
        </div>
      </div>

      {isOwner && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-5 md:p-6 mb-4 md:mb-6">
          <p className="text-gray-600">Upload pole testing reports below.</p>

          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <>
              <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer">
                Upload Main CSV
                <input type="file" accept=".csv" hidden onChange={handleMainCSVUpload} />
              </label>

              <label className="bg-green-600 text-white px-4 py-2 rounded-lg cursor-pointer">
                Upload OHMS CSV
                <input type="file" accept=".csv" hidden onChange={handleOHMSCSVUpload} />
              </label>
            </>

            <button
              className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300"
              onClick={clearAll}
              type="button"
            >
              Clear
            </button>

            <button
              className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900"
              onClick={async () => {
                if (!activeOrgId) return;
                await loadPolesFromSupabase(activeOrgId);
                await loadTablePage(activeOrgId);
                await loadMapRows(activeOrgId);
              }}
              type="button"
            >
              Refresh from Supabase
            </button>

            {activeOrgId && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="w-full sm:w-[260px] border rounded-md p-2 text-sm"
                  placeholder="Invite employee email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <button
                  className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm"
                  type="button"
                  onClick={async () => {
                    try {
                      setInviteStatus("Inviting member...");
                      if (!activeOrgId) return;
                      await inviteMember({
                        orgId: activeOrgId,
                        email: inviteEmail,
                        role: "member",
                      });
                      setInviteStatus("Member invite sent!");
                      setInviteEmail("");
                    } catch (e: any) {
                      console.error(e);
                      setInviteStatus(e?.message ?? "Invite failed");
                    }
                  }}
                  disabled={!inviteEmail.trim()}
                >
                  Invite Member
                </button>

                <button
                  className="bg-gray-700 text-white px-3 py-2 rounded-md text-sm"
                  type="button"
                  onClick={async () => {
                    try {
                      setInviteStatus("Inviting viewer...");
                      if (!activeOrgId) return;
                      await inviteMember({
                        orgId: activeOrgId,
                        email: inviteEmail,
                        role: "viewer",
                      });
                      setInviteStatus("Viewer invite sent!");
                      setInviteEmail("");
                    } catch (e: any) {
                      console.error(e);
                      setInviteStatus(e?.message ?? "Invite failed");
                    }
                  }}
                  disabled={!inviteEmail.trim()}
                >
                  Invite Viewer
                </button>

                {inviteStatus && <span className="text-sm text-gray-700">{inviteStatus}</span>}
              </div>
            )}

            {status && <span className="text-sm text-gray-700">{status}</span>}
          </div>

          <div className="text-sm text-gray-600 mt-2">
            Map points detected: <b>{points.length}</b>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={poleSearch}
            onChange={(e) => setPoleSearch(e.target.value)}
            placeholder="Search Pole ID..."
            className="w-full sm:w-[280px] rounded-md border px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => setZoomToAllTrigger((n) => n + 1)}
            className="rounded-md bg-[#094929] px-4 py-2 text-sm text-white hover:bg-[#0c5a33]"
          >
            Zoom Out to All Poles
          </button>

          <button
            type="button"
            onClick={() => {
              setPoleSearch("");
              setSelectedPoleId(null);
              setZoomToAllTrigger((n) => n + 1);
            }}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200"
          >
            Clear Search
          </button>
        </div>

        <div className="text-sm text-gray-500">
          Showing {filteredPoints.length} of {points.length} poles
        </div>
      </div>

        <div className="bg-white rounded-xl shadow p-4 sm:p-5 md:p-6 mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Map View</h2>

            {selectedPoleId && (
              <button
                className="text-sm px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200"
                onClick={() => setSelectedPoleId(null)}
                type="button"
              >
                Clear selection
              </button>
            )}
          </div>

          {mapLoading ? (
            <p className="text-sm text-gray-600">Loading map...</p>
          ) : filteredPoints.length === 0 ? (
            <p className="text-sm text-gray-600">
              No map points match your search, or your CSV is missing valid Latitude and Longitude columns.
            </p>
          ) : (
            <div className="w-full h-[280px] sm:h-[340px] md:h-[420px] lg:h-[500px] border border-gray-200 rounded-lg overflow-hidden">
              <PoleMap
                points={filteredPoints}
                selected={selectedPoint}
                onSelect={async (id: string) => {
                  setSelectedPoleId(id);
                  await goToPoleInTable(id);
                }}
                zoomToAllTrigger={zoomToAllTrigger}
                fieldOrder={tableHeaders}
              />
            </div>
          )}

          <p className="text-sm text-gray-600 mt-3">
            Tip: Click a marker to select a pole.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow p-4 sm:p-5 md:p-6 mb-4 md:mb-6">
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
              Filtered results: {tableTotalRows}
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

              {pageNumbers.map((page, idx) =>
                page === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-gray-500">
                    ...
                  </span>
                ) : (
                  <button
                    key={`${page}-${idx}`}
                    type="button"
                    onClick={() => setCurrentPage(Number(page))}
                    className={
                      "min-w-[40px] rounded border px-3 py-2 text-sm " +
                      (currentPage === page
                        ? "bg-gray-300 font-semibold"
                        : "bg-white hover:bg-gray-100")
                    }
                  >
                    {page}
                  </button>
                )
              )}

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

          <div
            ref={tableContainerRef}
            className="overflow-x-auto max-h-[500px] overflow-y-auto"
          >

          {tableLoading && (
            <div className="p-3 text-sm text-gray-600">
              Loading table...
            </div>
          )}

          {lastRefresh && (
            <div className="text-xs text-gray-500 mt-2">
              Last refreshed: {lastRefresh}
            </div>
          )}

          {tableRows.length === 0 && !tableLoading ? (
            <p className="text-center p-4 text-gray-500">
              No poles match the selected filters.
            </p>
          ) : (
            <table className="min-w-full border border-gray-300 text-sm">

              <thead className="sticky top-0 z-10 bg-gray-200">
                <tr>
                  <th className="border p-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelectedPoleIds((prev) => {
                          const next = { ...prev };
                          for (const row of paginatedRows) {
                            const id = getPoleId(row) ?? "";
                            if (id) next[id] = checked;
                          }
                          return next;
                        });
                      }}
                    />
                  </th>

                  {tableHeaders.map((h) => (
                    <th
                      key={h}
                      className="border p-2 whitespace-nowrap cursor-pointer select-none hover:bg-gray-300"
                      onClick={() => {
                        if (sortColumn === h) {
                          setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                        } else {
                          setSortColumn(h);
                          setSortDirection("asc");
                        }
                      }}
                    >
                      {h}
                      {sortColumn === h && (
                        <span className="ml-1">
                          {sortDirection === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
                </thead>

              <tbody>
                {paginatedRows.map((row, idx) => {
                  const poleId = getPoleId(row) ?? "";

                  return (
                    <tr
                      key={`${poleId}-${idx}`}
                      data-pole-id={poleId}
                      onClick={() => setSelectedPoleId(poleId || null)}
                      className={
                        "cursor-pointer transition-colors " +
                        (poleId === selectedPoleId
                          ? "bg-yellow-100 ring-2 ring-inset ring-yellow-400"
                          : idx % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50")
                      }
                    >
                      <td className="border p-2 align-top">
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
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>

                      {tableHeaders.map((h) => {
                        const raw = row?.[h];

                        if (h === "Comments") {
                          const val = commentsByPole[poleId] ?? "";
                          const saveState = commentSaveStatus[poleId] ?? "idle";

                          return (
                            <td key={h} className="border p-2 align-top min-w-[220px]">
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
                                  value={val}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setCommentsByPole((prev) => ({ ...prev, [poleId]: next }));
                                    if (poleId) saveCommentToSupabase(poleId, next);
                                  }}
                                  placeholder="Add notes..."
                                  className="w-full min-h-[60px] p-2 border rounded-md text-sm"
                                />
                              ) : (
                                <div className="w-full min-h-[60px] p-2 border rounded-md text-sm bg-gray-50 whitespace-pre-wrap">
                                  {val || ""}
                                </div>
                              )}
                            </td>
                          );
                        }

                        const value = String(raw ?? "").trim();
                        const isUrl = looksLikeUrl(value);
                        const href = isUrl ? normalizeUrl(value) : "";

                        return (
                          <td key={h} className="border p-2 align-top">
                            {h === "Images" && isUrl ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline"
                              >
                                Open Photos
                              </a>
                            ) : (
                              value
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>
      {isOwner && showImportSummary && importSummaryData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              {importSummaryData.title}
            </h3>

            <div className="mt-4 space-y-2 text-sm text-gray-700">
              {importSummaryData.lines.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowImportSummary(false)}
                className="rounded-md bg-[#094929] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c5a33]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}