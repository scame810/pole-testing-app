"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/map", label: "Map" },
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

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <aside
        style={{
          width: 240,
          background: "#0f172a",
          color: "white",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Pole Testing</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
            Dashboard
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            height: 64,
            background: "white",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>Pole Testing Dashboard</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>Signed in</div>
        </header>

        <main style={{ padding: 24 }}>{children}</main>
      </div>
    </div>
  );
}