import { redirect } from "next/navigation";

import AdminCreditAdjuster from "../../components/AdminCreditAdjuster";
import AdminMarketRow from "../../components/AdminMarketRow";
import CreateMarketForm from "../../components/CreateMarketForm";
import { getCurrentUser } from "../../lib/auth";
import { getPool } from "../../lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams
}: {
  searchParams?: { suggestionId?: string | string[] };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-zinc-300">You are not an admin.</p>
      </div>
    );
  }

  const pool = getPool();
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

  const initialSuggestionIdRaw = searchParams?.suggestionId;
  const initialSuggestionId = Array.isArray(initialSuggestionIdRaw)
    ? initialSuggestionIdRaw[0]
    : initialSuggestionIdRaw;

  const suggestionsRes = await pool.query<{
    id: string;
    title: string;
    details: string;
    status: "PENDING" | "USED" | "REJECTED";
    created_at: string;
    username: string;
  }>(
    `
      SELECT s.id, s.title, s.details, s.status, s.created_at, u.username
      FROM suggestions s
      JOIN users u ON u.id = s.created_by
      WHERE s.market_id IS NULL AND s.status IN ('PENDING', 'USED')
      ORDER BY (s.status = 'PENDING') DESC, s.created_at DESC
      LIMIT 100
    `
  );

  const res = await pool.query<{
    id: string;
    title: string;
    description: string;
    rules: string;
    closes_at: string;
    resolves_at: string;
    status: "OPEN" | "CLOSED" | "RESOLVED";
    outcome: "YES" | "NO" | null;
    created_at: string;
  }>(
    `
      SELECT id, title, description, rules, closes_at, resolves_at, status, outcome, created_at
      FROM markets
      ORDER BY created_at DESC
      LIMIT 50
    `
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-zinc-300">Create, edit, and resolve markets.</p>
      </div>

      <CreateMarketForm
        users={usersRes.rows.map((u) => ({ id: u.id, username: u.username }))}
        suggestions={suggestionsRes.rows.map((s) => ({
          id: s.id,
          title: s.title,
          details: s.details,
          status: s.status,
          createdAt: s.created_at,
          createdByUsername: s.username
        }))}
        initialSuggestionId={initialSuggestionId}
      />

      <AdminCreditAdjuster
        users={usersRes.rows.map((u) => ({
          id: u.id,
          username: u.username,
          balanceCents: Number(u.balance_cents)
        }))}
      />

      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-sm font-medium">Manage markets</h2>
        <div className="mt-3 space-y-2">
          {res.rows.map((m) => (
            <AdminMarketRow
              key={m.id}
              marketId={m.id}
              title={m.title}
              description={m.description}
              rules={m.rules}
              closesAt={m.closes_at}
              resolvesAt={m.resolves_at}
              status={m.status}
              outcome={m.outcome}
            />
          ))}
          {res.rowCount === 0 ? (
            <p className="text-sm text-zinc-400">No markets yet.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
