"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminSuggestionActions({ suggestionId }: { suggestionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<"ACCEPT" | "REJECT" | null>(null);

  async function decide(action: "ACCEPT" | "REJECT") {
    setError(null);
    setIsSubmitting(action);
    try {
      const res = await fetch(`/api/suggestions/${suggestionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");

      if (action === "ACCEPT") {
        router.push(`/admin?suggestionId=${encodeURIComponent(suggestionId)}`);
        return;
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSubmitting(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => decide("ACCEPT")}
          disabled={isSubmitting != null}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
        >
          {isSubmitting === "ACCEPT" ? "Accepting…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => decide("REJECT")}
          disabled={isSubmitting != null}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
        >
          {isSubmitting === "REJECT" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-200">{error}</p> : null}
    </div>
  );
}

