import { redirect } from "next/navigation";

import CreateMarketForm from "../../components/CreateMarketForm";
import ResolveMarketRow from "../../components/ResolveMarketRow";
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
    closes_at: string;
    status: "OPEN" | "CLOSED" | "RESOLVED";
    outcome: "YES" | "NO" | null;
    created_at: string;
  }>(
    `
      SELECT id, title, closes_at, status, outcome, created_at
      FROM markets
      ORDER BY created_at DESC
      LIMIT 50
    `
  );

  const now = Date.now();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-zinc-300">Create and resolve markets.</p>
      </div>

      <CreateMarketForm />

      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-sm font-medium">Resolve</h2>
        <div className="mt-3 space-y-2">
          {res.rows.map((m) => (
            <ResolveMarketRow
              key={m.id}
              marketId={m.id}
              title={m.title}
              closesAt={m.closes_at}
              isClosable={now >= new Date(m.closes_at).getTime()}
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

