"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UserRow = {
  id: string;
  username: string;
  balanceCents: number;
};

export default function AdminUserDeleter({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim() })
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      setSuccess(data.message ?? "User deleted successfully");
      setUsername("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || users.length === 0;

  return (
    <div className="rounded-md border border-red-900/50 bg-red-950/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-red-200">Delete user</h2>
        <span className="text-xs text-red-400/70">
          This will liquidate all shares and delete the account
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Username</span>
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-red-700"
              placeholder="Enter username to delete"
              disabled={disabled}
              list="user-list"
            />
            <datalist id="user-list">
              {users.map((u) => (
                <option key={u.id} value={u.username} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !username.trim()}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </label>

        <p className="text-xs text-red-400/70">
          ⚠️ This action will:
          <br />
          • Liquidate all shares in open markets
          <br />
          • Delete the user account permanently
          <br />
          • Cannot be undone
        </p>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="mt-3 rounded-md border border-green-900 bg-green-950/40 px-3 py-2 text-sm text-green-200">
          {success}
        </p>
      ) : null}
    </div>
  );
}
