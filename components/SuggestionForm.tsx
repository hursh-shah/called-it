"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SuggestionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, details })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Suggestion failed");
      setTitle("");
      setDetails("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suggestion failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || title.trim().length < 3;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="text-sm font-medium">Suggest a market</h2>
      <div className="mt-3 space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Idea</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            placeholder="Will X happen by Y?"
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-zinc-400">Details (optional)</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="h-28 w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
            placeholder="Context, sources, and suggested resolution rules."
          />
        </label>

        {error ? (
          <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          disabled={disabled}
          className="rounded-md bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
        >
          {isSubmitting ? "Sending…" : "Send suggestion"}
        </button>
      </div>
    </div>
  );
}

