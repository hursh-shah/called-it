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

  const openMarkets = res.rows.filter((m) => m.status !== "RESOLVED" && !m.outcome);
  const openMarketIds = openMarkets.map((m) => m.id);
  const priceYesByMarketId = new Map<string, number>(
    openMarkets.map((m) => [m.id, lmsrPriceYes(m.b, m.q_yes, m.q_no)])
  );

  const usersRes = await pool.query<{
    id: string;
    username: string;
    balance_cents: string;
  }>(
    `
      SELECT id, username, balance_cents
      FROM users
      ORDER BY username ASC
    `
  );

  const positionsRes =
    openMarketIds.length > 0
      ? await pool.query<{
          user_id: string;
          market_id: string;
          shares_yes: number;
          shares_no: number;
        }>(
          `
            SELECT user_id, market_id, shares_yes, shares_no
            FROM positions
            WHERE market_id = ANY($1::uuid[])
          `,
          [openMarketIds]
        )
      : { rows: [] as Array<{ user_id: string; market_id: string; shares_yes: number; shares_no: number }> };

  const holdingsValueCentsByUserId = new Map<string, number>();
  for (const pos of positionsRes.rows) {
    const pYes = priceYesByMarketId.get(pos.market_id);
    if (pYes == null) continue;
    const pNo = 1 - pYes;
    const valueCredits = pos.shares_yes * pYes + pos.shares_no * pNo;
    const valueCents = Math.round(valueCredits * 100);
    if (valueCents === 0) continue;
    holdingsValueCentsByUserId.set(
      pos.user_id,
      (holdingsValueCentsByUserId.get(pos.user_id) ?? 0) + valueCents
    );
  }

  const leaderboard = usersRes.rows
    .map((u) => {
      const balanceCents = Number(u.balance_cents);
      const holdingsCents = holdingsValueCentsByUserId.get(u.id) ?? 0;
      return {
        id: u.id,
        username: u.username,
        totalCents: balanceCents + holdingsCents
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Markets</h1>
        <div className="flex items-center gap-2">
          {!user.isAdmin ? (
            <Link
              href="/suggestions"
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-900"
            >
              Suggest
            </Link>
          ) : null}
          {user.isAdmin ? (
            <Link
              href="/admin"
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-900"
            >
              Create
            </Link>
          ) : null}
        </div>
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
                <div className="flex flex-col items-end text-right">
                  <div className="text-sm text-zinc-200">
                    YES {Math.round(pYes * 100)}%
                  </div>
                  <div className="text-xs text-zinc-400">
                    Vol {formatCredits(Number(m.volume_cents))}
                  </div>
                  <Link
                    href={`/markets/${m.id}`}
                    className="mt-2 inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/40 px-3 py-2 text-xs font-medium text-zinc-50 hover:bg-zinc-900"
                  >
                    Trade
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
        {res.rowCount === 0 ? (
          <li className="text-sm text-zinc-300">No markets yet.</li>
        ) : null}
      </ul>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Leaderboard</h2>
          <span className="text-xs text-zinc-500">
            includes open shares
          </span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-2">Name</th>
                <th className="py-2 text-right">Credits</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-zinc-800 text-zinc-200"
                >
                  <td className="py-2">{row.username}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCredits(row.totalCents)}
                  </td>
                </tr>
              ))}
              {leaderboard.length === 0 ? (
                <tr className="border-t border-zinc-800">
                  <td className="py-2 text-zinc-400" colSpan={2}>
                    No users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
