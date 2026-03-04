"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const updatePassword = async () => {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Password updated. You can now log in.");
    }
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