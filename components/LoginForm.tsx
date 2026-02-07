"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ initialToken }: { initialToken?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteToken, setInviteToken] = useState(initialToken ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const body: { username: string; password?: string; inviteToken?: string } = {
        username
      };
      
      // Include password if provided, otherwise include invite token
      if (password) {
        body.password = password;
      } else if (inviteToken) {
        body.inviteToken = inviteToken;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
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
          autoComplete="username"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-200">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          placeholder="Enter your password (or use invite code below)"
          autoComplete="current-password"
        />
        <p className="text-xs text-zinc-400">
          If you haven&apos;t set a password yet, use your invite code below instead.
        </p>
      </label>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-700"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-950 px-2 text-zinc-400">Or</span>
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-sm text-zinc-200">Invite Code</span>
        <input
          type="text"
          value={inviteToken}
          onChange={(e) => setInviteToken(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          placeholder="Use this if you haven't set a password yet"
          autoComplete="off"
        />
      </label>
      {error ? (
        <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting || (!password && !inviteToken)}
        className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
      >
        {isSubmitting ? "Logging in…" : "Login"}
      </button>
    </form>
  );
}
