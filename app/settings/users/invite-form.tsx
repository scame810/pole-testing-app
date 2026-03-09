"use client";

import { useState, useTransition } from "react";
import { inviteMember } from "../../actions/inviteMember";

export default function InviteForm({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "member" | "viewer">("viewer");
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  function sendInvite() {
    setStatus("");

    startTransition(async () => {
      try {
        await inviteMember({
          orgId,
          email,
          role,
        });

        setStatus("Invite sent.");
        setEmail("");
      } catch (err: any) {
        setStatus(err.message || "Failed to send invite");
      }
    });
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
        Invite User
      </h2>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="email"
          placeholder="email@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8, flex: 1 }}
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          style={{ padding: 8 }}
        >
          <option value="viewer">viewer</option>
          <option value="member">member</option>
          <option value="owner">owner</option>
        </select>

        <button
          onClick={sendInvite}
          disabled={!email || isPending}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "#2563eb",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          Invite
        </button>
      </div>

      {status && (
        <p style={{ marginTop: 10, color: "#475569" }}>{status}</p>
      )}
    </div>
  );
}