"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateMarketForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [b, setB] = useState("1000");
  const [initialProbability, setInitialProbability] = useState("0.5");
  const [closesAt, setClosesAt] = useState("");
  const [resolvesAt, setResolvesAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
