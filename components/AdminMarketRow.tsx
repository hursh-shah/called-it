"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  formatPacificDateTime,
  pacificDatetimeLocalToIso,
  toPacificDatetimeLocalValue
} from "../lib/time";

type Props = {
  marketId: string;
  title: string;
  description: string;
  rules: string;
  closesAt: string;
  resolvesAt: string;
  status: "OPEN" | "CLOSED" | "RESOLVED";
  outcome: "YES" | "NO" | null;
};

export default function AdminMarketRow(props: Props) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description);
  const [rules, setRules] = useState(props.rules);
  const [closesAt, setClosesAt] = useState(toPacificDatetimeLocalValue(props.closesAt));
  const [resolvesAt, setResolvesAt] = useState(
    toPacificDatetimeLocalValue(props.resolvesAt)
  );

  const [forceResolve, setForceResolve] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    setTitle(props.title);
    setDescription(props.description);
    setRules(props.rules);
    setClosesAt(toPacificDatetimeLocalValue(props.closesAt));
    setResolvesAt(toPacificDatetimeLocalValue(props.resolvesAt));
  }, [
    props.title,
    props.description,
    props.rules,
    props.closesAt,
    props.resolvesAt,
    isEditing
  ]);

  const isResolved = props.status === "RESOLVED" || props.outcome != null;

  const isClosable = useMemo(() => {
    return Date.now() >= new Date(props.closesAt).getTime();
  }, [props.closesAt]);

  async function patchMarket(body: Record<string, unknown>) {
    const res = await fetch(`/api/markets/${props.marketId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? "Update failed");
    }
  }

  async function saveEdits() {
    setError(null);
    setIsSubmitting(true);
    try {
      await patchMarket({
        title,
        description,
        rules,
        closesAt: pacificDatetimeLocalToIso(closesAt),
        resolvesAt: pacificDatetimeLocalToIso(resolvesAt)
      });
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function closeNow() {
    setError(null);
    setIsSubmitting(true);
    try {
      await patchMarket({ closesAt: new Date().toISOString() });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resolve(outcome: "YES" | "NO") {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/markets/${props.marketId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome, force: forceResolve })
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

  const resolveDisabled =
    isSubmitting || isResolved || (!forceResolve && !isClosable);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link href={`/markets/${props.marketId}`} className="text-sm font-medium">
            {props.title}
          </Link>
          <div className="text-xs text-zinc-500">
            closes {formatPacificDateTime(props.closesAt)} • resolves{" "}
            {formatPacificDateTime(props.resolvesAt)} • {props.status}
            {props.outcome ? ` (${props.outcome})` : ""}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            disabled={isSubmitting}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
          >
            {isEditing ? "Cancel" : "Edit"}
          </button>
          <button
            type="button"
            onClick={closeNow}
            disabled={isSubmitting || isResolved}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
          >
            Close now
          </button>
          <button
            type="button"
            onClick={() => resolve("YES")}
            disabled={resolveDisabled}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
          >
            Resolve YES
          </button>
          <button
            type="button"
            onClick={() => resolve("NO")}
            disabled={resolveDisabled}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
          >
            Resolve NO
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={forceResolve}
            onChange={(e) => setForceResolve(e.target.checked)}
            className="h-4 w-4 accent-zinc-200"
            disabled={isSubmitting || isResolved}
          />
          Force resolve (ignore close time)
        </label>
        {!isResolved && !isClosable && !forceResolve ? (
          <span className="text-xs text-zinc-500">Resolve after close (or force).</span>
        ) : null}
      </div>

      {isEditing ? (
        <div className="mt-3 space-y-3 rounded-md border border-zinc-800 bg-zinc-900/20 p-3">
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-zinc-400">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-zinc-400">Description</span>
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
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="text-xs text-zinc-400">Closes at (Pacific)</span>
              <input
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
                type="datetime-local"
                required
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-xs text-zinc-400">Resolves at (Pacific)</span>
              <input
                value={resolvesAt}
                onChange={(e) => setResolvesAt(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none"
                type="datetime-local"
                required
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={saveEdits}
              disabled={isSubmitting}
              className="rounded-md bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
