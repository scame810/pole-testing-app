"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const linkStyle = {
  color: "#094929",
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 6,
  background: "#d1e7dd",
  textDecoration: "none",
};

export default function TopNav() {
  const pathname = usePathname();

  const hideOnRoutes = [
    "/login",
    "/accept-invite",
    "/update-password",
  ];

  const shouldHide =
    hideOnRoutes.some((route) => pathname.startsWith(route)) ||
    pathname.startsWith("/auth/callback");

  if (shouldHide) return null;

  return (
    <div
      style={{
        background: "#e6f4ea",
        padding: 12,
        borderBottom: "1px solid #cce3d4",
      }}
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" style={linkStyle}>
          Dashboard
        </Link>

        <Link href="/reports" style={linkStyle}>
          Reports
        </Link>

        <Link href="/settings/users" style={linkStyle}>
          Users
        </Link>

        <Link href="/settings" style={linkStyle}>
          Settings
        </Link>
      </div>
    </div>
  );
}