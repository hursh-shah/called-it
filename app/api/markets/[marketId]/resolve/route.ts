import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "../../../../../lib/auth";
import { getPool } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResolveBody = z.object({
  outcome: z.enum(["YES", "NO"]),
  note: z.string().trim().max(2000).optional(),
  force: z.boolean().optional()
});

export async function POST(req: Request, context: { params: { marketId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = ResolveBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const marketRes = await client.query<{
      status: "OPEN" | "CLOSED" | "RESOLVED";
      closes_at: string;
      outcome: "YES" | "NO" | null;
    }>(
      `
        SELECT status, closes_at, outcome
        FROM markets
        WHERE id = $1
        FOR UPDATE
      `,
      [context.params.marketId]
    );
    const market = marketRes.rows[0];
    if (!market) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }
    if (market.status === "RESOLVED" || market.outcome) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Market already resolved." },
        { status: 400 }
      );
    }
    if (!parsed.data.force && Date.now() < new Date(market.closes_at).getTime()) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Market must be closed before resolving." },
        { status: 400 }
      );
    }

    await client.query(
      `
        UPDATE markets
        SET status = 'RESOLVED', outcome = $1, resolved_at = now()
        WHERE id = $2
      `,
      [parsed.data.outcome, context.params.marketId]
    );

    const note = parsed.data.note ?? "";

    await client.query(
      `
        WITH winners AS (
          SELECT
            user_id,
            CASE
              WHEN $2::market_outcome = 'YES' THEN shares_yes
              ELSE shares_no
            END AS winning_shares
          FROM positions
          WHERE market_id = $1
        ),
        payouts AS (
          SELECT
            user_id,
            round(winning_shares * 100)::bigint AS payout_cents
          FROM winners
          WHERE winning_shares > 0
        )
        UPDATE users u
        SET balance_cents = u.balance_cents + p.payout_cents
        FROM payouts p
        WHERE u.id = p.user_id
      `,
      [context.params.marketId, parsed.data.outcome]
    );

    await client.query(
      `
        WITH winners AS (
          SELECT
            user_id,
            CASE
              WHEN $2::market_outcome = 'YES' THEN shares_yes
              ELSE shares_no
            END AS winning_shares
          FROM positions
          WHERE market_id = $1
        ),
        payouts AS (
          SELECT
            user_id,
            round(winning_shares * 100)::bigint AS payout_cents
          FROM winners
          WHERE winning_shares > 0
        )
        INSERT INTO ledger_entries (user_id, market_id, type, amount_cents, note)
        SELECT user_id, $1, 'PAYOUT', payout_cents, $3
        FROM payouts
      `,
      [context.params.marketId, parsed.data.outcome, note]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resolve failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
