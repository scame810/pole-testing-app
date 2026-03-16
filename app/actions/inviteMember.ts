"use server";

import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "../../lib/supabaseServer";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function inviteMember(params: {
  orgId: string;
  email: string;
  role: "owner" | "member" | "viewer";
}) {
  const { orgId, email, role = "member" } = params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;

  if (!user) throw new Error("Not authenticated");

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (!membership || membership.role !== "owner") {
    throw new Error("Only organization owners can invite users");
  }

  let userId: string | null = null;

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/login`,
  });

  if (error) {
    if (error.code === "email_exists") {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const existing = users.users.find((u) => u.email === email);
      userId = existing?.id ?? null;
    } else {
      throw error;
    }
  } else {
    userId = data.user?.id ?? null;
  }

  if (!userId) throw new Error("Could not determine user id");

  const { error: memErr } = await supabaseAdmin
    .from("memberships")
    .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: "org_id,user_id" });

  if (memErr) throw memErr;

  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .upsert({ user_id: userId, active_org_id: orgId }, { onConflict: "user_id" });

  if (profErr) throw profErr;

  return { ok: true, invitedUserId: userId };
}