import { redirect } from "next/navigation";
import UsersTable from "./users-table";
import { createServerSupabaseClient } from "../../../lib/supabaseServer";

export default async function UsersPage() {
  const supabase = await createServerSupabaseClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Pick current org: simplest = first membership
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <h1>User Management</h1>
        <p>Error loading membership: {error.message}</p>
      </div>
    );
  }

  if (!membership?.org_id) {
    return (
      <div style={{ padding: 16 }}>
        <h1>User Management</h1>
        <p>You are not in an organization yet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        User Management
      </h1>
      <UsersTable orgId={membership.org_id} myRole={membership.role} />
    </div>
  );
}