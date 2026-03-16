"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function restoreRecoverySession() {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const type = params.get("type");

      if (token_hash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: "recovery",
        });

        if (error) {
          setStatus(error.message);
        }
      }
    }

    restoreRecoverySession();
  }, []);

  const updatePassword = async () => {
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
      >
        Update Password
      </button>

      <p className="mt-4">{status}</p>
    </main>
  );
}