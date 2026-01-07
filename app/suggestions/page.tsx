import Link from "next/link";
import { redirect } from "next/navigation";

import AdminSuggestionActions from "../../components/AdminSuggestionActions";
import SuggestionForm from "../../components/SuggestionForm";
import { getCurrentUser } from "../../lib/auth";
import { getPool } from "../../lib/db";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const pool = getPool();
  const res = await pool.query<{
    id: string;
    title: string;
    details: string;
    status: "PENDING" | "USED" | "REJECTED";
    created_at: string;
    created_by: string;
    username: string;
    market_id: string | null;
    used_at: string | null;
  }>(
    user.isAdmin
      ? `
          SELECT
            s.id,
            s.title,
            s.details,
            s.status,
            s.created_at,
            s.created_by,
            u.username,
            s.market_id,
            s.used_at
          FROM suggestions s
          JOIN users u ON u.id = s.created_by
          ORDER BY s.created_at DESC
          LIMIT 200
        `
      : `
          SELECT
            s.id,
            s.title,
            s.details,
            s.status,
            s.created_at,
            s.created_by,
            u.username,
            s.market_id,
            s.used_at
          FROM suggestions s
          JOIN users u ON u.id = s.created_by
          WHERE s.created_by = $1
          ORDER BY s.created_at DESC
          LIMIT 200
        `,
    user.isAdmin ? undefined : [user.id]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Suggestions</h1>
        <p className="text-sm text-zinc-300">
          Share ideas for new markets. Admins can turn these into markets.
        </p>
      </div>

      <SuggestionForm />

      <div className="rounded-md border border-zinc-800 bg-zinc-900/30 p-4">
        <h2 className="text-sm font-medium">
          {user.isAdmin ? "All suggestions" : "Your suggestions"}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
          {res.rows.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-medium text-zinc-100">{s.title}</div>
                  {s.details ? (
                    <p className="whitespace-pre-wrap text-sm text-zinc-300">
                      {s.details}
                    </p>
                  ) : null}
                  <div className="text-xs text-zinc-500">
                    {user.isAdmin ? (
                      <>
                        {s.username} •{" "}
                      </>
                    ) : null}
                    {new Date(s.created_at).toLocaleString()}
                    {" • "}
                    {s.status === "USED" && !s.market_id ? "ACCEPTED" : s.status}
                    {s.market_id ? (
                      <>
                        {" • "}
                        <Link
                          href={`/markets/${s.market_id}`}
                          className="underline"
                        >
                          market
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
                {user.isAdmin && s.status === "PENDING" ? (
                  <AdminSuggestionActions suggestionId={s.id} />
                ) : null}
              </div>
            </li>
          ))}
          {res.rowCount === 0 ? (
            <li className="text-sm text-zinc-400">No suggestions yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
