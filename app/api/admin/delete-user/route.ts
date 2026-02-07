import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { lmsrTradeCost, type Side } from "../../../../lib/lmsr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DeleteUserBody = z.object({
  username: z.string().trim().min(1)
});

export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!admin.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = DeleteUserBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find the user to delete
    const userRes = await client.query<{
      id: string;
      username: string;
    }>(
      `
        SELECT id, username
        FROM users
        WHERE username = $1
        FOR UPDATE
      `,
      [parsed.data.username]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.id === admin.id) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Cannot delete your own account." },
        { status: 400 }
      );
    }

    // Get all positions for this user
    const positionsRes = await client.query<{
      market_id: string;
      shares_yes: number;
      shares_no: number;
    }>(
      `
        SELECT market_id, shares_yes, shares_no
        FROM positions
        WHERE user_id = $1
        FOR UPDATE
      `,
      [user.id]
    );

    // Liquidate all positions
    for (const position of positionsRes.rows) {
      // Get market details
      const marketRes = await client.query<{
        id: string;
        status: "OPEN" | "CLOSED" | "RESOLVED";
        closes_at: string;
        outcome: "YES" | "NO" | null;
        b: number;
        q_yes: number;
        q_no: number;
      }>(
        `
          SELECT id, status, closes_at, outcome, b, q_yes, q_no
          FROM markets
          WHERE id = $1
          FOR UPDATE
        `,
        [position.market_id]
      );
      const market = marketRes.rows[0];
      if (!market) continue;

      // Skip if market is resolved or closed
      if (market.status === "RESOLVED" || market.outcome) continue;
      const closesAtMs = new Date(market.closes_at).getTime();
      if (Date.now() >= closesAtMs) continue;

      // Liquidate YES shares
      if (position.shares_yes > 1e-9) {
        const deltaShares = -position.shares_yes;
        const costCredits = lmsrTradeCost(
          market.b,
          market.q_yes,
          market.q_no,
          "YES",
          deltaShares
        );
        const costCents = Math.round(costCredits * 100);

        if (costCents < 0) {
          // User receives money from selling (costCents is negative, so we add the absolute value)
          const nextQYes = market.q_yes + deltaShares;

          await client.query(
            `
              UPDATE markets
              SET
                q_yes = $1,
                volume_cents = volume_cents + $2
              WHERE id = $3
            `,
            [nextQYes, Math.abs(costCents), market.id]
          );

          await client.query(
            `
              INSERT INTO trades (user_id, market_id, side, delta_shares, cost_cents)
              VALUES ($1, $2, 'YES', $3, $4)
            `,
            [user.id, market.id, deltaShares, costCents]
          );

          await client.query(
            `
              UPDATE users
              SET balance_cents = balance_cents - $1
              WHERE id = $2
            `,
            [costCents, user.id]
          );
        }
      }

      // Liquidate NO shares
      if (position.shares_no > 1e-9) {
        // Refresh market state after YES liquidation
        const refreshedMarketRes = await client.query<{
          q_yes: number;
          q_no: number;
        }>(
          `
            SELECT q_yes, q_no
            FROM markets
            WHERE id = $1
          `,
          [market.id]
        );
        const refreshedMarket = refreshedMarketRes.rows[0];

        const deltaShares = -position.shares_no;
        const costCredits = lmsrTradeCost(
          market.b,
          refreshedMarket.q_yes,
          refreshedMarket.q_no,
          "NO",
          deltaShares
        );
        const costCents = Math.round(costCredits * 100);

        if (costCents < 0) {
          // User receives money from selling (costCents is negative, so we add the absolute value)
          const nextQNo = refreshedMarket.q_no + deltaShares;

          await client.query(
            `
              UPDATE markets
              SET
                q_no = $1,
                volume_cents = volume_cents + $2
              WHERE id = $3
            `,
            [nextQNo, Math.abs(costCents), market.id]
          );

          await client.query(
            `
              INSERT INTO trades (user_id, market_id, side, delta_shares, cost_cents)
              VALUES ($1, $2, 'NO', $3, $4)
            `,
            [user.id, market.id, deltaShares, costCents]
          );

          await client.query(
            `
              UPDATE users
              SET balance_cents = balance_cents - $1
              WHERE id = $2
            `,
            [costCents, user.id]
          );
        }
      }
    }

    // Delete the user (cascades will handle sessions, trades, positions, ledger_entries)
    await client.query(
      `
        DELETE FROM users
        WHERE id = $1
      `,
      [user.id]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      message: `User ${parsed.data.username} deleted successfully.`
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
