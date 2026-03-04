"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createBrowserSupabaseClient } from "../../../lib/supabaseBrowser";

type MemberRow = {
  user_id: string;
  email: string | null;
  role: "owner" | "member" | "viewer";
  created_at: string;
};

export default function UsersTable({
  orgId,
  myRole,
}: {
  orgId: string;
  myRole: string;
}) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canManage = myRole === "owner";

  async function load() {
    setError(null);
    const { data, error } = await supabase.rpc("list_org_members", {
      p_org_id: orgId,
    });
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as MemberRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function changeRole(userId: string, role: MemberRow["role"]) {
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.rpc("set_member_role", {
        p_org_id: orgId,
        p_user_id: userId,
        p_role: role,
      });
      if (error) setError(error.message);
      await load();
    });
  }

  async function removeUser(userId: string) {
    setError(null);
    if (!confirm("Remove this user from the org?")) return;
    startTransition(async () => {
      const { error } = await supabase.rpc("remove_member", {
        p_org_id: orgId,
        p_user_id: userId,
      });
      if (error) setError(error.message);
      await load();
    });
  }

  return (
    <div>
      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fecaca",
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ padding: "10px 8px" }}>Email</th>
              <th style={{ padding: "10px 8px" }}>Role</th>
              <th style={{ padding: "10px 8px" }}>Added</th>
              <th style={{ padding: "10px 8px" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 8px" }}>{r.email ?? "(none)"}</td>
                <td style={{ padding: "10px 8px" }}>
                  {canManage ? (
                    <select
                      value={r.role}
                      onChange={(e) =>
                        changeRole(r.user_id, e.target.value as any)
                      }
                      style={{ padding: 6, borderRadius: 6 }}
                    >
                      <option value="owner">owner</option>
                      <option value="member">member</option>
                      <option value="viewer">viewer</option>
                    </select>
                  ) : (
                    r.role
                  )}
                </td>
                <td style={{ padding: "10px 8px" }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "10px 8px", textAlign: "right" }}>
                  {canManage ? (
                    <button
                      onClick={() => removeUser(r.user_id)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  ) : (
                    <span style={{ color: "#64748b" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 12, color: "#64748b" }}>
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!canManage && (
          <p style={{ marginTop: 10, color: "#64748b" }}>
            Only <b>owners</b> can change roles or remove users.
          </p>
        )}
      </div>
    </div>
  );
}