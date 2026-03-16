"use server";

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function acceptInvite(params: {
  token: string;
  password: string;
}) {
  const { token, password } = params;

  if (!token) throw new Error("Missing invite token");
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("org_invites")
    .select("id, org_id, email, role, expires_at, accepted_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (inviteError) throw inviteError;
  if (!invite) throw new Error("Invite not found");
  if (invite.accepted_at) throw new Error("Invite has already been used");
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new Error("Invite has expired");
  }

  const { data: usersResult } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = usersResult.users.find(
    (u) => (u.email || "").toLowerCase() === invite.email.toLowerCase()
  );

  let userId: string;

  if (existingUser) {
    throw new Error("An account for this email already exists. Please log in or use Forgot Password.");
  } else {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    });

    if (createError) throw createError;
    if (!created.user?.id) throw new Error("Could not create user");

    userId = created.user.id;
  }

  const { error: membershipError } = await supabaseAdmin
    .from("memberships")
    .upsert(
      {
        org_id: invite.org_id,
        user_id: userId,
        role: invite.role,
      },
      { onConflict: "org_id,user_id" }
    );

  if (membershipError) throw membershipError;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        active_org_id: invite.org_id,
      },
      { onConflict: "user_id" }
    );

  if (profileError) throw profileError;

  const { error: markUsedError } = await supabaseAdmin
    .from("org_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (markUsedError) throw markUsedError;

  return {
    ok: true,
    email: invite.email,
  };
}