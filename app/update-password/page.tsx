"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Checking recovery session...");
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      // Give Supabase a moment to process URL auth params/hash
      setTimeout(async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setStatus("Recovery session not found. Please request a new reset email.");
          return;
        }

        setReady(true);
        setStatus("");
      }, 500);
    }

    checkSession();
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