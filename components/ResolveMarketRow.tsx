"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  marketId: string;
  title: string;
  closesAt: string;
  isClosable: boolean;
  status: "OPEN" | "CLOSED" | "RESOLVED";
  outcome: "YES" | "NO" | null;
};

export default function ResolveMarketRow(props: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(outcome: "YES" | "NO") {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/markets/${props.marketId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Resolve failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || props.status === "RESOLVED" || !props.isClosable;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Link href={`/markets/${props.marketId}`} className="text-sm font-medium">
            {props.title}
          </Link>
          <div className="text-xs text-zinc-500">
            closes {new Date(props.closesAt).toLocaleString()} • {props.status}
            {props.outcome ? ` (${props.outcome})` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => resolve("YES")}
            disabled={disabled}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
          >
            Resolve YES
          </button>
          <button
            type="button"
            onClick={() => resolve("NO")}
            disabled={disabled}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
          >
            Resolve NO
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-200">{error}</p>
      ) : !props.isClosable && props.status !== "RESOLVED" ? (
        <p className="mt-2 text-xs text-zinc-500">
          Can resolve after close.
        </p>
      ) : null}
    </div>
  );
}

