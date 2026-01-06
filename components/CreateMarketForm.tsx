"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type UserOption = { id: string; username: string };
type SuggestionOption = {
  id: string;
  title: string;
  details: string;
  createdAt: string;
  createdByUsername: string;
};

export default function CreateMarketForm({
  users,
  suggestions
}: {
  users: UserOption[];
  suggestions?: SuggestionOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [suggestionId, setSuggestionId] = useState("");
  const [involvedUserIds, setInvolvedUserIds] = useState<string[]>([]);
  const [b, setB] = useState("1000");
  const [initialProbability, setInitialProbability] = useState("0.5");
  const [closesAt, setClosesAt] = useState("");
  const [resolvesAt, setResolvesAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleInvolvedUserId(userId: string) {
    setInvolvedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          rules,
          involvedUserIds,
          suggestionId: suggestionId || undefined,
          b: Number(b),
          initialProbability: Number(initialProbability),
          closesAt: new Date(closesAt).toISOString(),
          resolvesAt: new Date(resolvesAt).toISOString()
        })
      });
      const data = (await res.json()) as { error?: string; market?: { id: string } };
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      router.replace(`/markets/${data.market?.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="text-sm font-medium">Create market</h2>
      <div className="mt-3 space-y-3">
        {suggestions && suggestions.length > 0 ? (
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-zinc-400">From suggestion (optional)</span>
            <select
              value={suggestionId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSuggestionId(nextId);
                const selected = suggestions.find((s) => s.id === nextId);
                if (selected) {
                  setTitle(selected.title);
                  if (selected.details) {
                    setRules(selected.details);
                  }
                }
              }}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
              disabled={isSubmitting}
            >
              <option value="">None</option>
              {suggestions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.createdByUsername})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            placeholder="Will X happen by Y?"
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Description (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Resolution rules</span>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className="h-28 w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            placeholder="Define what counts, who decides, and the deadline/timezone."
            required
          />
        </label>

        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-400">Users involved (can’t trade)</div>
          <div className="mt-2 grid max-h-40 gap-2 overflow-auto sm:grid-cols-2">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={involvedUserIds.includes(u.id)}
                  onChange={() => toggleInvolvedUserId(u.id)}
                  className="h-4 w-4 accent-zinc-200"
                  disabled={isSubmitting}
                />
                <span>{u.username}</span>
              </label>
            ))}
            {users.length === 0 ? (
              <p className="text-xs text-zinc-500">No users found.</p>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Include anyone directly involved to prevent betting on themselves.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-zinc-400">b (liquidity)</span>
            <input
              value={b}
              onChange={(e) => setB(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
              inputMode="decimal"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-zinc-400">Start P(YES)</span>
            <input
              value={initialProbability}
              onChange={(e) => setInitialProbability(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
              inputMode="decimal"
              required
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-zinc-400">Closes at</span>
            <input
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
              type="datetime-local"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-zinc-400">Resolves at</span>
            <input
              value={resolvesAt}
              onChange={(e) => setResolvesAt(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
              type="datetime-local"
              required
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={isSubmitting}
          className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
        >
          {isSubmitting ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}
