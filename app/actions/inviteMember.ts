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
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) throw new Error("Invite succeeded but no user id returned.");

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