"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function restoreSession() {
      try {
        const query = new URLSearchParams(window.location.search);
        const token_hash = query.get("token_hash");
        const type = query.get("type");

        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const access_token = hash.get("access_token");
        const refresh_token = hash.get("refresh_token");
        const hashType = hash.get("type");

        // 1) token_hash flow
        if (token_hash && (type === "recovery" || type === "invite")) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as "recovery" | "invite",
          });

          if (error) {
            setStatus(error.message);
            return;
          }
        }

        // 2) hash fragment flow
        else if (
          access_token &&
          refresh_token &&
          (hashType === "recovery" || hashType === "invite")
        ) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            setStatus(error.message);
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setStatus("Recovery session not found. Please request a new reset email.");
          return;
        }

        setReady(true);
      } catch (err: any) {
        setStatus(err?.message || "Could not restore session.");
      }
    }

    restoreSession();
  }, []);

  const updatePassword = async () => {
    if (!ready) {
      setStatus("Recovery session not ready yet.");
      return;
    }

    setStatus("Updating password...");

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Password updated successfully. Redirecting...");

    setTimeout(() => {
      router.push("/login");
    }, 1500);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-xl font-semibold mb-4">Set New Password</h1>

      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 mb-4"
      />

      <button
        onClick={updatePassword}
        className="bg-black text-white px-4 py-2 rounded"
        disabled={!ready}
      >
        Update Password
      </button>

      <p className="mt-4">{status}</p>
    </main>
  );
}