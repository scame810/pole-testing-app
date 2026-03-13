"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

function LoginInner() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  const signIn = async () => {
    setStatus("Signing in...");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("signIn error:", error);
    console.log("signIn user:", data?.user);

    if (error) return setStatus(error.message);

    const { data: sessionData } = await supabase.auth.getSession();
    console.log("session after login:", sessionData.session);

    setStatus("Signed in. Redirecting...");
    router.replace(next);
    router.refresh();

    setTimeout(() => {
      window.location.href = next;
    }, 100);
  };

  const resetPassword = async () => {
    setStatus("Sending reset email...");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus("Password reset email sent.");
    }
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

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded-lg w-full"
          onClick={signIn}
          type="button"
        >
          Sign in
        </button>

        <button
          onClick={resetPassword}
          className="text-sm text-blue-600 underline mt-2"
          type="button"
        >
          Forgot Password?
        </button>

        {status && <div className="text-sm text-gray-700 mt-4">{status}</div>}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <LoginInner />
    </Suspense>
  );
}