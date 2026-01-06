import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth";
import { getPool } from "../../lib/db";
import { lmsrPriceYes } from "../../lib/lmsr";
import { formatCredits } from "../../lib/money";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pool = getPool();
  const res = await pool.query<{
    id: string;
    title: string;
    description: string;
    closes_at: string;
    resolves_at: string;
    status: "OPEN" | "CLOSED" | "RESOLVED";
    outcome: "YES" | "NO" | null;
    b: number;
    q_yes: number;
    q_no: number;
    volume_cents: string;
    created_at: string;
  }>(
    `
      SELECT
        id,
        title,
        description,
        closes_at,
        resolves_at,
        status,
        outcome,
        b,
        q_yes,
        q_no,
        volume_cents,
        created_at
      FROM markets
      ORDER BY created_at DESC
      LIMIT 100
    `
  );

  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
        {user.isAdmin ? (
          <Link
            href="/admin"
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-900"
          >
            Create
          </Link>
        ) : null}
      </div>
      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-200">
        Balance: <span className="font-medium">{formatCredits(user.balanceCents)}</span>
      </div>
      <ul className="space-y-3">
        {res.rows.map((m) => {
          const closesAtMs = new Date(m.closes_at).getTime();
          const isClosed = m.status !== "OPEN" || now >= closesAtMs;
          const pYes = lmsrPriceYes(m.b, m.q_yes, m.q_no);
          const statusLabel =
            m.status === "RESOLVED"
              ? `RESOLVED: ${m.outcome ?? "—"}`
              : isClosed
                ? "CLOSED"
                : "OPEN";

          return (
            <li
              key={m.id}
              className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4 hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Link href={`/markets/${m.id}`} className="font-medium">
                    {m.title}
                  </Link>
                  {m.description ? (
                    <p className="text-sm text-zinc-300">{m.description}</p>
                  ) : null}
                  <p className="text-xs text-zinc-400">
                    {statusLabel} • closes{" "}
                    {new Date(m.closes_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-zinc-200">
                    YES {Math.round(pYes * 100)}%
                  </div>
                  <div className="text-xs text-zinc-400">
                    Vol {formatCredits(Number(m.volume_cents))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {res.rowCount === 0 ? (
          <li className="text-sm text-zinc-300">No markets yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
