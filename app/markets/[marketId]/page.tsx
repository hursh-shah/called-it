import Link from "next/link";
import { redirect } from "next/navigation";

import TradeForm from "../../../components/TradeForm";
import { getCurrentUser } from "../../../lib/auth";
import { getPool } from "../../../lib/db";
import { lmsrPriceYes } from "../../../lib/lmsr";
import { formatCredits } from "../../../lib/money";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  params
}: {
  params: { marketId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pool = getPool();
  const marketRes = await pool.query<{
    id: string;
    title: string;
    description: string;
    rules: string;
    closes_at: string;
    resolves_at: string;
    status: "OPEN" | "CLOSED" | "RESOLVED";
    outcome: "YES" | "NO" | null;
    b: number;
    q_yes: number;
    q_no: number;
    volume_cents: string;
  }>(
    `
      SELECT
        id,
        title,
        description,
        rules,
        closes_at,
        resolves_at,
        status,
        outcome,
        b,
        q_yes,
        q_no,
        volume_cents
      FROM markets
      WHERE id = $1
      LIMIT 1
    `,
    [params.marketId]
  );

  const market = marketRes.rows[0];
  if (!market) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-300">Market not found.</p>
        <Link href="/markets" className="text-sm underline">
          Back
        </Link>
      </div>
    );
  }

  const positionRes = await pool.query<{
    shares_yes: number;
    shares_no: number;
    cost_cents_yes: string;
    cost_cents_no: string;
  }>(
    `
      SELECT shares_yes, shares_no, cost_cents_yes, cost_cents_no
      FROM positions
      WHERE user_id = $1 AND market_id = $2
      LIMIT 1
    `,
    [user.id, market.id]
  );
  const position = positionRes.rows[0] ?? {
    shares_yes: 0,
    shares_no: 0,
    cost_cents_yes: "0",
    cost_cents_no: "0"
  };

  const tradesRes = await pool.query<{
    id: string;
    username: string;
    side: "YES" | "NO";
    delta_shares: number;
    cost_cents: string;
    created_at: string;
  }>(
    `
      SELECT
        t.id,
        u.username,
        t.side,
        t.delta_shares,
        t.cost_cents,
        t.created_at
      FROM trades t
      JOIN users u ON u.id = t.user_id
      WHERE t.market_id = $1
      ORDER BY t.created_at DESC
      LIMIT 20
    `,
    [market.id]
  );

  const now = Date.now();
  const closesAtMs = new Date(market.closes_at).getTime();
  const tradingClosed = market.status !== "OPEN" || now >= closesAtMs;
  const pYes = lmsrPriceYes(market.b, market.q_yes, market.q_no);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/markets" className="text-sm text-zinc-400 underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{market.title}</h1>
        {market.description ? (
          <p className="text-sm text-zinc-300">{market.description}</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="text-xs text-zinc-400">YES</div>
          <div className="text-xl font-semibold">{Math.round(pYes * 100)}%</div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="text-xs text-zinc-400">Volume</div>
          <div className="text-xl font-semibold">
            {formatCredits(Number(market.volume_cents))}
          </div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="text-xs text-zinc-400">Status</div>
          <div className="text-xl font-semibold">
            {market.status === "RESOLVED"
              ? `RESOLVED: ${market.outcome ?? "—"}`
              : tradingClosed
                ? "CLOSED"
                : "OPEN"}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            Balance: <span className="font-medium">{formatCredits(user.balanceCents)}</span>
          </div>
          <div className="text-zinc-400">
            Closes {new Date(market.closes_at).toLocaleString()}
          </div>
        </div>
        <div className="mt-2 text-zinc-400">
          Resolves {new Date(market.resolves_at).toLocaleString()}
        </div>
      </div>

      {market.rules ? (
        <details className="rounded-md border border-zinc-800 bg-zinc-900/20 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Resolution rules
          </summary>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">
            {market.rules}
          </p>
        </details>
      ) : null}

      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-sm font-medium">Your position</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="text-xs text-zinc-400">YES shares</div>
            <div className="font-medium">{position.shares_yes.toFixed(4)}</div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="text-xs text-zinc-400">NO shares</div>
            <div className="font-medium">{position.shares_no.toFixed(4)}</div>
          </div>
        </div>
      </div>

      <TradeForm
        marketId={market.id}
        b={market.b}
        qYes={market.q_yes}
        qNo={market.q_no}
        tradingClosed={tradingClosed || market.status === "RESOLVED"}
        userBalanceCents={user.balanceCents}
        userSharesYes={position.shares_yes}
        userSharesNo={position.shares_no}
      />

      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-sm font-medium">Recent trades</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
          {tradesRes.rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3">
              <span className="text-zinc-400">
                {new Date(t.created_at).toLocaleString()}
              </span>
              <span className="flex-1">
                <span className="font-medium text-zinc-200">{t.username}</span>{" "}
                {t.delta_shares >= 0 ? "bought" : "sold"}{" "}
                {Math.abs(t.delta_shares).toFixed(4)} {t.side}
              </span>
              <span className="tabular-nums">
                {formatCredits(-Number(t.cost_cents))}
              </span>
            </li>
          ))}
          {tradesRes.rowCount === 0 ? (
            <li className="text-sm text-zinc-400">No trades yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

