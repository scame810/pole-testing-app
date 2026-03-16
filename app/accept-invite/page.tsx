"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "../actions/acceptInvite";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const token =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token") ?? ""
        : "";

    if (!token) {
      setStatus("Missing invite token");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const result = await acceptInvite({ token, password });
      setStatus("Password created successfully. Redirecting to login...");

      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(result.email)}`);
      }, 1200);
    } catch (err: any) {
      setStatus(err?.message || "Could not accept invite");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-bold">Accept Invite</h1>
        <p className="mb-4 text-sm text-gray-600">
          Create your password to access the dashboard.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Create password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border p-3"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-[#094929] px-4 py-3 text-white disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Set Password"}
          </button>
        </form>

        {status && <p className="mt-4 text-sm text-gray-700">{status}</p>}
      </div>
    </main>
  );
}