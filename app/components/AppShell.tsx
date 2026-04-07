"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings", label: "Settings" },
];

type MembershipRow = {
  org_id: string;
  role: string;
  orgs?: {
    id: string;
    name: string | null;
  }[] | null;
};

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const supabase = createSupabaseBrowserClient();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  useEffect(() => {
    loadMemberships();
  }, []);

  async function loadMemberships() {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) return;

    const userId = session.user.id;

    const { data, error } = await supabase
      .from("memberships")
      .select(`
        org_id,
        role,
        orgs (
          id,
          name
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error || !data) {
      console.error("Failed to load memberships:", error);
      return;
    }

    const rows = (data || []) as MembershipRow[];
    setMemberships(rows);

    const savedOrgId = window.localStorage.getItem("selectedOrgId");

    const savedStillExists = rows.some((row) => row.org_id === savedOrgId);

    if (savedOrgId && savedStillExists) {
      setSelectedOrgId(savedOrgId);
      return;
    }

    if (rows.length > 0) {
      const fallbackOrgId = rows[0].org_id;
      setSelectedOrgId(fallbackOrgId);
      window.localStorage.setItem("selectedOrgId", fallbackOrgId);
      window.dispatchEvent(new Event("selected-org-changed"));
    }
  }

  function handleOrgChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newOrgId = e.target.value;
    setSelectedOrgId(newOrgId);
    window.localStorage.setItem("selectedOrgId", newOrgId);
    window.dispatchEvent(new Event("selected-org-changed"));
  }

  async function signOut() {
    try {
      setIsSigningOut(true);
      window.localStorage.removeItem("selectedOrgId");
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (e) {
      console.error("Sign out failed:", e);
      setIsSigningOut(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <aside
        style={{
          width: "clamp(120px, 16vw, 220px)",
          background: "#0f172a",
          color: "white",
          padding: 12,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <Image
            src="/logo.jpg"
            alt="Company logo"
            width={200}
            height={90}
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="org-select"
            style={{
              display: "block",
              fontSize: 12,
              marginBottom: 6,
              opacity: 0.85,
            }}
          >
            Customer
          </label>

          <select
            id="org-select"
            value={selectedOrgId}
            onChange={handleOrgChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#1e293b",
              color: "white",
            }}
          >
            {memberships.length === 0 ? (
              <option value="">No organizations</option>
            ) : (
              memberships.map((item) => (
                <option key={item.org_id} value={item.org_id}>
                  {item.orgs?.[0]?.name || item.org_id}
                </option>
              ))
            )}
          </select>
        </div>

        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "white",
                  background: active ? "#1e293b" : "transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={signOut}
          style={{
            marginTop: 16,
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: "#1e293b",
            color: "white",
            cursor: isSigningOut ? "default" : "pointer",
            textAlign: "left",
            opacity: isSigningOut ? 0.7 : 1,
          }}
          type="button"
          disabled={isSigningOut}
        >
          {isSigningOut ? "Signing out..." : "Sign Out"}
        </button>

        <div style={{ flexGrow: 1 }} />
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <main style={{ padding: 24 }}>{children}</main>
      </div>
    </div>
  );
}