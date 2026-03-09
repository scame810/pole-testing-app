"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings", label: "Settings" },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <aside
        style={{
          width: 240,
          background: "#0f172a",
          color: "white",
          padding: 16,
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
            cursor: "pointer",
            textAlign: "left",
          }}
          type="button"
        >
          Sign Out
        </button>

        <div style={{ flexGrow: 1 }} />
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <main style={{ padding: 24 }}>{children}</main>
      </div>
    </div>
  );
}