"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ initialToken }: { initialToken?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [token, setToken] = useState(initialToken ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, token })
      });
      const text = await res.text();
      const data = (() => {
        try {
          return JSON.parse(text) as { error?: string };
        } catch {
          return null;
        }
      })();
      if (!res.ok) {
        throw new Error(
          data?.error ??
            `Login failed (HTTP ${res.status}). Check server logs.`
        );
      }
      router.replace("/markets");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm text-zinc-200">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          placeholder="e.g. hursh"
          autoComplete="nickname"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-200">Invite token</span>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          placeholder="from your invite link"
          required
        />
      </label>
      {error ? (
        <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
      >
        {isSubmitting ? "Logging in…" : "Login"}
      </button>
    </form>
  );
}
