"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/profile/set-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
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
            `Failed to set password (HTTP ${res.status}). Check server logs.`
        );
      }
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="mb-4 text-lg font-medium">Set Password</h2>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm text-zinc-200">New Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-zinc-200">Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              placeholder="Confirm your password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          {error ? (
            <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-md border border-green-900 bg-green-950/40 px-3 py-2 text-sm text-green-200">
              Password set successfully!
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
          >
            {isSubmitting ? "Setting password…" : "Set Password"}
          </button>
        </div>
      </div>
    </form>
  );
}
