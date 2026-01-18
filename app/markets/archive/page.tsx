import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../lib/auth";
import { getPool } from "../../../lib/db";
import { formatCredits } from "../../../lib/money";
import { formatPacificDateTime } from "../../../lib/time";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
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
    resolved_at: string | null;
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
        resolved_at,
        b,
        q_yes,
        q_no,
        volume_cents,
        created_at
      FROM markets
      WHERE status = 'RESOLVED' OR outcome IS NOT NULL
      ORDER BY resolved_at DESC NULLS LAST, created_at DESC
    `
  );

  // Get biggest winners for each resolved market
  const marketIds = res.rows.map((m) => m.id);
  const winnersRes =
    marketIds.length > 0
      ? await pool.query<{
          market_id: string;
          username: string;
          winning_shares: number;
        }>(
          `
            WITH market_outcomes AS (
              SELECT id, outcome
              FROM markets
              WHERE id = ANY($1::uuid[])
            ),
            winning_positions AS (
              SELECT
                p.market_id,
                p.user_id,
                CASE
                  WHEN mo.outcome = 'YES' THEN p.shares_yes
                  WHEN mo.outcome = 'NO' THEN p.shares_no
                  ELSE 0
                END AS winning_shares
              FROM positions p
              JOIN market_outcomes mo ON mo.id = p.market_id
              WHERE p.market_id = ANY($1::uuid[])
                AND (
                  (mo.outcome = 'YES' AND p.shares_yes > 0)
                  OR (mo.outcome = 'NO' AND p.shares_no > 0)
                )
            ),
            ranked_winners AS (
              SELECT
                wp.market_id,
                u.username,
                wp.winning_shares,
                ROW_NUMBER() OVER (
                  PARTITION BY wp.market_id
                  ORDER BY wp.winning_shares DESC
                ) AS rank
              FROM winning_positions wp
              JOIN users u ON u.id = wp.user_id
            )
            SELECT market_id, username, winning_shares
            FROM ranked_winners
            WHERE rank = 1
          `,
          [marketIds]
        )
      : { rows: [] as Array<{ market_id: string; username: string; winning_shares: number }> };

  const biggestWinnerByMarketId = new Map<string, string>();
  for (const winner of winnersRes.rows) {
    biggestWinnerByMarketId.set(winner.market_id, winner.username);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href="/markets" className="text-sm text-zinc-400 underline">
            ← Back to Markets
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Archive
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            All resolved prediction markets
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {res.rows.map((m) => {
          const outcomeLabel = m.outcome ?? "—";
          const outcomeColor =
            m.outcome === "YES"
              ? "text-green-400"
              : m.outcome === "NO"
                ? "text-red-400"
                : "text-zinc-400";
          const biggestWinner = biggestWinnerByMarketId.get(m.id);

          return (
            <li
              key={m.id}
              className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4 hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <Link href={`/markets/${m.id}`} className="font-medium">
                    {m.title}
                  </Link>
                  {m.description ? (
                    <p className="text-sm text-zinc-300">{m.description}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <span className={`font-medium ${outcomeColor}`}>
                      RESOLVED: {outcomeLabel}
                    </span>
                    {m.resolved_at ? (
                      <span>
                        Resolved {formatPacificDateTime(m.resolved_at)}
                      </span>
                    ) : null}
                    <span>
                      Closed {formatPacificDateTime(m.closes_at)}
                    </span>
                    {biggestWinner ? (
                      <span className="text-zinc-300">
                        🏆 {biggestWinner}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col items-end text-right">
                  <div className="text-xs text-zinc-400">
                    Vol {formatCredits(Number(m.volume_cents))}
                  </div>
                  <Link
                    href={`/markets/${m.id}`}
                    className="mt-2 inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/40 px-3 py-2 text-xs font-medium text-zinc-50 hover:bg-zinc-900"
                  >
                    View
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
        {res.rowCount === 0 ? (
          <li className="rounded-md border border-zinc-800 bg-zinc-900/30 p-8 text-center text-sm text-zinc-300">
            No resolved markets yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
