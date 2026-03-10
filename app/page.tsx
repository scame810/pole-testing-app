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

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();

  const [mainRows, setMainRows] = useState<Row[]>([]);
  const [ohmsMap, setOhmsMap] = useState<Record<string, Row>>({});
  const [status, setStatus] = useState<string>("");
  const [selectedPoleId, setSelectedPoleId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [commentsByPole, setCommentsByPole] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [supabaseStatus, setSupabaseStatus] = useState("not run");
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [dataByPoleId, setDataByPoleId] = useState<Record<string, any>>({});
  const [ownerOrgs, setOwnerOrgs] = useState<{ org_id: string; name?: string }[]>([]);
  const [activeRole, setActiveRole] = useState<"owner" | "member" | "viewer" | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const saveTimersRef = useRef<Record<string, any>>({});

  const isOwner = activeRole === "owner";
  const isMember = activeRole === "member";
  const isViewer = activeRole === "viewer";
  const roleLabel = isOwner ? "Owner" : isMember ? "Member" : isViewer ? "Viewer" : "No role";

  const canImport = activeRole === "owner";
  const canEditComments = activeRole === "owner" || activeRole === "member";

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        router.replace("/login");
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
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
      } catch (e) {
        console.error("Save comment failed:", e);
      }
    }, 500);
  }

  async function mergeOhmsToSupabase(rows: Row[]) {
    const ohmsCols = ["OHMS", "Ground Rods", "OHMS Rod 1", "GW Repair", "Guy Markers"];
    const byId = new Map<string, Record<string, any>>();

    for (const r of rows) {
      const pole_id = getPoleId(r);
      if (!pole_id) continue;

      const patch: Record<string, any> = {};

      for (const c of ohmsCols) {
        const v = r?.[c];
        if (v !== undefined && v !== null && String(v).trim() !== "") patch[c] = v;
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

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("active_org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) throw pErr;

    if (profile?.active_org_id) {
      setActiveOrgId(profile.active_org_id);
      return profile.active_org_id;
    }

    const { data: mems, error: mErr } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1);

    if (mErr) throw mErr;

    const firstOrg = mems?.[0]?.org_id ?? null;
    setActiveOrgId(firstOrg);

    if (firstOrg) {
      await supabase
        .from("profiles")
        .upsert({ user_id: user.id, active_org_id: firstOrg }, { onConflict: "user_id" });
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

    const nextDataByPole: Record<string, any> = {};
    const nextComments: Record<string, string> = {};

    const rows: Row[] = (data ?? []).map((r: any) => {
      nextDataByPole[r.pole_id] = r.data ?? {};

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

    setDataByPoleId(nextDataByPole);
    setCommentsByPole(nextComments);
    setMainRows(rows);
    setSupabaseStatus(`ok (loaded: ${rows.length})`);
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
    (async () => {
      try {
        const orgId = await loadActiveOrg();
        if (!orgId) {
          setSupabaseStatus("No org selected (activeOrgId is null)");
          return;
        }

        const owners = await loadOwnerOrgs();
        setOwnerOrgs(owners);

        await loadActiveRole(orgId);
        await loadPolesFromSupabase(orgId);
      } catch (e: any) {
        console.error("Error loading org:", e);

        const msg =
          e?.message ||
          e?.error?.message ||
          e?.details ||
          (typeof e === "string" ? e : JSON.stringify(e));

        setSupabaseStatus(`Error loading org: ${msg}`);
      }
    })();
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

      byId.set(pole_id, { pole_id, org_id: activeOrgId, latitude, longitude, data: r });
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

  const exportCombinedCsv = () => {
    if (mergedRows.length === 0) return;

    const rowsWithComments = mergedRows.map((row) => {
      const id = getPoleId(row) ?? "";
      return {
        ...row,
        Comments: commentsByPole[id] ?? "",
      };
    });

    const ordered = rowsWithComments.map((r) => {
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
  };

  const mergedRows = useMemo(() => {
    if (mainRows.length === 0) return [];
    return mainRows.map((r) => {
      const id = getPoleId(r);
      const extra = id ? ohmsMap[id] : undefined;
      return { ...r, ...(extra || {}) };
    });
  }, [mainRows, ohmsMap]);

  const sortedRows = useMemo(() => {
    if (!sortColumn) return mergedRows;

    const rows = [...mergedRows];

    rows.sort((a, b) => {
      const aVal = a?.[sortColumn];
      const bVal = b?.[sortColumn];

      const numA = Number(aVal);
      const numB = Number(bVal);

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDirection === "asc" ? numA - numB : numB - numA;
      }

      const strA = String(aVal ?? "").toLowerCase();
      const strB = String(bVal ?? "").toLowerCase();

      if (strA < strB) return sortDirection === "asc" ? -1 : 1;
      if (strA > strB) return sortDirection === "asc" ? 1 : -1;

      return 0;
    });

    return rows;
  }, [mergedRows, sortColumn, sortDirection]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedRows.slice(start, end);
  }, [sortedRows, currentPage, rowsPerPage]);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const endRow = Math.min(currentPage * rowsPerPage, totalRows);

  const points = useMemo<PolePoint[]>(() => {
  return mergedRows
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
      };
    })
    .filter(Boolean) as PolePoint[];
}, [mergedRows]);

  const selectedPoint = useMemo(
    () => points.find((p) => p.id === selectedPoleId) ?? null,
    [points, selectedPoleId]
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
  }, [selectedPoleId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortColumn, sortDirection, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [mergedRows.length]);

  const tableHeaders = useMemo(() => {
    if (mergedRows.length === 0) return [];

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
    for (const r of mergedRows) Object.keys(r || {}).forEach((k) => all.add(k));

    POLE_ID_KEYS.filter((k) => k !== "Pole ID").forEach((k) => all.delete(k));

    const out: string[] = [];
    const used = new Set<string>();

    for (const h of preferred) {
      if (all.has(h) && !used.has(h)) {
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
  }, [mergedRows]);

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
      transformHeader: (h) => h.trim(),
      complete: async (results) => {
        const rows = (results.data || []).filter((r) => Object.keys(r || {}).length > 0);

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

          setStatus(`Done. Saved ${res.count} poles.`);
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
      transformHeader: (h) => h.trim(),
      complete: async (results) => {
        const rows = (results.data || []).filter((r) => Object.keys(r || {}).length > 0);

        (async () => {
          try {
            setStatus(`OHMS CSV parsed: ${rows.length} rows. Saving to Supabase...`);
            const res = await mergeOhmsToSupabase(rows);
            setStatus(`Saved OHMS for ${res.count} poles. Reloading...`);
            if (!activeOrgId) throw new Error("No activeOrgId selected");
            await loadPolesFromSupabase(activeOrgId);
            setStatus(`Done. Updated OHMS for ${res.count} poles.`);
            event.target.value = "";
          } catch (e: any) {
            console.error("OHMS save error full:", e);
            const msg =
              e?.message || e?.error?.message || (typeof e === "string" ? e : JSON.stringify(e));
            setStatus(`Supabase OHMS save error: ${msg}`);
            event.target.value = "";
          }
        })();

        const map: Record<string, Row> = {};
        let matched = 0;
        let missingId = 0;

        for (const r of rows) {
          const id = getPoleId(r);
          if (!id) {
            missingId++;
            continue;
          }
          map[id] = r;
        }

        if (mainRows.length > 0) {
          for (const mr of mainRows) {
            const id = getPoleId(mr);
            if (id && map[id]) matched++;
          }
        }

        setOhmsMap(map);

        const msg =
          mainRows.length > 0
            ? `OHMS CSV loaded: ${rows.length} rows (${matched} matched to Main by Pole ID)`
            : `OHMS CSV loaded: ${rows.length} rows (upload Main CSV to see matches)`;

        setStatus(missingId > 0 ? `${msg} — ${missingId} rows missing Pole ID` : msg);
        event.target.value = "";
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
    setMainRows([]);
    setOhmsMap({});
    setSelectedPoleId(null);
    setStatus("");
    setCommentsByPole({});
  };

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

          {isOwner && (
            <div className="text-sm text-gray-500">
              Supabase status: <b>{supabaseStatus}</b>
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
            onClick={exportCombinedCsv}
            type="button"
            disabled={mergedRows.length === 0}
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

            {ownerOrgs.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">Org:</span>
                <select
                  className="w-full sm:w-[260px] border rounded-md p-2 text-sm"
                  value={activeOrgId ?? ""}
                  onChange={async (e) => {
                    const nextOrg = e.target.value;
                    setActiveOrgId(nextOrg);

                    const {
                      data: { session },
                    } = await supabase.auth.getSession();

                    const user = session?.user ?? null;

                    if (user) {
                      const { error } = await supabase
                        .from("profiles")
                        .update({ active_org_id: nextOrg })
                        .eq("user_id", user.id);

                      if (error) {
                        console.error(error);
                        alert("Not allowed to switch organizations.");
                        return;
                      }
                    }

                    await loadActiveRole(nextOrg);
                    await loadPolesFromSupabase(nextOrg);
                  }}
                >
                  {ownerOrgs.map((o) => (
                    <option key={o.org_id} value={o.org_id}>
                      {o.name ?? o.org_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

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

          {points.length === 0 ? (
            <p className="text-sm text-gray-600">
              No map points yet. Your CSV must include valid Latitude and Longitude columns
              (numbers).
            </p>
          ) : (
            <div className="w-full h-[280px] sm:h-[340px] md:h-[420px] lg:h-[500px] border border-gray-200 rounded-lg overflow-hidden">
              <PoleMap
                points={points}
                selected={selectedPoint}
                onSelect={(id: string) => setSelectedPoleId(id)}
              />
            </div>
          )}

          <p className="text-sm text-gray-600 mt-3">
            Tip: Click a marker to select a pole. We can highlight/scroll the matching row next.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow p-4 sm:p-5 md:p-6 mb-4 md:mb-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>
                Showing {startRow} to {endRow} of {totalRows} rows
              </span>

              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="rounded-md border px-2 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              <span>rows per page</span>
            </div>

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
          </div>

          <div
            ref={tableContainerRef}
            className="overflow-x-auto max-h-[500px] overflow-y-auto"
          >

          {mergedRows.length === 0 ? (
            <p className="text-center p-4 text-gray-500">No data uploaded yet.</p>
          ) : (
            <table className="min-w-full border border-gray-300 text-sm">
              <thead className="sticky top-0 z-10 bg-gray-200">
                <tr>
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
                          ? "bg-yellow-100"
                          : idx % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50")
                      }
                    >
                      {tableHeaders.map((h) => {
                        const raw = row?.[h];

                        if (h === "Comments") {
                          const val = commentsByPole[poleId] ?? "";

                          return (
                            <td key={h} className="border p-2 align-top min-w-[220px]">
                              {canEditComments ? (
                                <textarea
                                  value={val}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setCommentsByPole((prev) => ({ ...prev, [poleId]: next }));
                                    if (poleId) saveCommentToSupabase(poleId, next);
                                  }}
                                  placeholder="Add notes…"
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
    </AppShell>
  );
}