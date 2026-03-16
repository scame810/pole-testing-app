"use server";

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "../../lib/supabaseServer";
import { sendInviteEmail } from "../../lib/mailer";

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

  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) throw orgError;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days

  const { error: inviteError } = await supabaseAdmin
    .from("org_invites")
    .insert({
      org_id: orgId,
      email: email.toLowerCase().trim(),
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (inviteError) throw inviteError;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const inviteUrl = `${siteUrl}/accept-invite?token=${rawToken}`;

  await sendInviteEmail({
    to: email,
    orgName: org?.name ?? "Pole Testing Dashboard",
    inviteUrl,
    role,
  });

  return { ok: true };
}