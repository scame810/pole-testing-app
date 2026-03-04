"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  const signIn = async () => {
    setStatus("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setStatus(error.message);
    router.push("/");
  };

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Sign in</h1>
        <p className="text-sm text-gray-600 mb-4">
          Your account must be invited by an admin first.
        </p>

        <label className="block text-sm mb-2">Email</label>
        <input
          className="w-full border rounded-md p-2 mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="block text-sm mb-2">Password</label>
        <input
          className="w-full border rounded-md p-2 mb-4"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg w-full" onClick={signIn} type="button">
          Sign in
        </button>

        {status && <div className="text-sm text-gray-700 mt-4">{status}</div>}
      </div>
    </main>
  );
}