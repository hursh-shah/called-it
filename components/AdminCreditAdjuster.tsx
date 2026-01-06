"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { formatCredits } from "../lib/money";

type UserRow = {
  id: string;
  username: string;
  balanceCents: number;
};

export default function AdminCreditAdjuster({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [deltaCredits, setDeltaCredits] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === userId) ?? null;
  }, [users, userId]);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          deltaCredits: Number(deltaCredits),
          note: note.trim() || undefined
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Adjustment failed");
      setDeltaCredits("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || users.length === 0;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Adjust credits</h2>
        {selectedUser ? (
          <span className="text-xs text-zinc-400">
            {selectedUser.username}:{" "}
            <span className="font-medium text-zinc-200">
              {formatCredits(selectedUser.balanceCents)}
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="block space-y-1 text-sm sm:col-span-1">
          <span className="text-xs text-zinc-400">User</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            disabled={disabled}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm sm:col-span-1">
          <span className="text-xs text-zinc-400">Δ credits</span>
          <input
            value={deltaCredits}
            onChange={(e) => setDeltaCredits(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            placeholder="e.g. 50 or -10"
            inputMode="decimal"
            disabled={disabled}
          />
        </label>

        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="text-xs text-zinc-400">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            placeholder="reason for adjustment"
            disabled={disabled}
          />
        </label>

        <div className="sm:col-span-4">
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            className="w-full rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 sm:w-auto"
          >
            {isSubmitting ? "Applying…" : "Apply"}
          </button>
          <p className="mt-2 text-xs text-zinc-500">
            Use a negative number to subtract credits.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}

