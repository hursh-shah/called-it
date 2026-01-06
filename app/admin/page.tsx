import { redirect } from "next/navigation";

import AdminMarketRow from "../../components/AdminMarketRow";
import CreateMarketForm from "../../components/CreateMarketForm";
import { getCurrentUser } from "../../lib/auth";
import { getPool } from "../../lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
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

      <CreateMarketForm />

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
