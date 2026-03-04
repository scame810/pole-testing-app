"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function inviteMember(params: {
  orgId: string;
  email: string;
  role: "owner" | "member" | "viewer"
}) {
const { orgId, email, role = "member" } = params;

  // 1) Create/invite auth user (Supabase sends invite email)
  let userId: string | null = null;

const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

if (error) {
  if (error.code === "email_exists") {
    // User already exists — fetch their id instead
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const existing = users.users.find(u => u.email === email);
    userId = existing?.id ?? null;
  } else {
    throw error;
  }
} else {
  userId = data.user?.id ?? null;
}

if (!userId) throw new Error("Could not determine user id");

  // 2) Add membership
const { error: memErr } = await supabaseAdmin
  .from("memberships")
  .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: "org_id,user_id" });

if (memErr) throw memErr;

// 3) Ensure profile exists + set active org (optional but nice)
const { error: profErr } = await supabaseAdmin
  .from("profiles")
  .upsert({ user_id: userId, active_org_id: orgId }, { onConflict: "user_id" });

if (profErr) throw profErr;

return { ok: true, invitedUserId: userId };
}