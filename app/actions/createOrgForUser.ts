"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function createOrgForUser(params: { userId: string; orgName: string }) {
  const { userId, orgName } = params;

  const { data: org, error: orgErr } = await supabaseAdmin
    .from("orgs")
    .insert({ name: orgName })
    .select("id")
    .single();

  if (orgErr) throw orgErr;

  const { error: memErr } = await supabaseAdmin
    .from("memberships")
    .upsert({ org_id: org.id, user_id: userId, role: "owner" }, { onConflict: "org_id,user_id" });

  if (memErr) throw memErr;

  const { error: profErr } = await supabaseAdmin
    .from("profiles")
    .upsert({ user_id: userId, active_org_id: org.id }, { onConflict: "user_id" });

  if (profErr) throw profErr;

  return { orgId: org.id };
}