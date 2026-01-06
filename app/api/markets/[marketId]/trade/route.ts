import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getCurrentUser,
  grantMonthlyAllowanceTx
} from "../../../../../lib/auth";
import { getPool } from "../../../../../lib/db";
import { lmsrPriceYes, lmsrTradeCost, type Side } from "../../../../../lib/lmsr";
import { creditsToCents } from "../../../../../lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TradeBody = z.object({
  side: z.enum(["YES", "NO"]),
  kind: z.enum(["BUY", "SELL"]),
  amountType: z.enum(["CREDITS", "SHARES"]),
  amount: z.coerce.number().positive()
});

function costCentsForDelta({
  b,
  qYes,
  qNo,
  side,
  deltaShares
}: {
  b: number;
  qYes: number;
  qNo: number;
  side: Side;
  deltaShares: number;
}) {
  const costCredits = lmsrTradeCost(b, qYes, qNo, side, deltaShares);
  return Math.round(costCredits * 100);
}

function findDeltaSharesForMaxCostCents({
  b,
  qYes,
  qNo,
  side,
  maxCostCents
}: {
  b: number;
  qYes: number;
  qNo: number;
  side: Side;
  maxCostCents: number;
}) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 60; i++) {
    const cost = costCentsForDelta({ b, qYes, qNo, side, deltaShares: high });
    if (cost > maxCostCents) break;
    high *= 2;
  }

  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2;
    const cost = costCentsForDelta({ b, qYes, qNo, side, deltaShares: mid });
    if (cost <= maxCostCents) low = mid;
    else high = mid;
  }

  return low;
}

export async function POST(req: Request, context: { params: { marketId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = TradeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (parsed.data.kind === "SELL" && parsed.data.amountType !== "SHARES") {
    return NextResponse.json(
      { error: "Selling currently requires SHARES amount type." },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRowRes = await client.query<{
      balance_cents: string;
      last_allowance_ym: number | null;
    }>(
      `
        SELECT balance_cents, last_allowance_ym
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [user.id]
    );
    const userRow = userRowRes.rows[0];
    if (!userRow) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found." }, { status: 401 });
    }

    await grantMonthlyAllowanceTx(client, {
      id: user.id,
      lastAllowanceYm: userRow.last_allowance_ym
    });

    const refreshedUser = await client.query<{ balance_cents: string }>(
      "SELECT balance_cents FROM users WHERE id = $1",
      [user.id]
    );
    let balanceCents = Number(refreshedUser.rows[0].balance_cents);

    const marketRes = await client.query<{
      id: string;
      status: "OPEN" | "CLOSED" | "RESOLVED";
      closes_at: string;
      outcome: "YES" | "NO" | null;
      b: number;
      q_yes: number;
      q_no: number;
      volume_cents: string;
    }>(
      `
        SELECT id, status, closes_at, outcome, b, q_yes, q_no, volume_cents
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

    const closesAtMs = new Date(market.closes_at).getTime();
    if (Date.now() >= closesAtMs) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Trading is closed for this market." },
        { status: 400 }
      );
    }

    const side = parsed.data.side;
    const b = market.b;
    const qYes = market.q_yes;
    const qNo = market.q_no;

    const positionRes = await client.query<{
      shares_yes: number;
      shares_no: number;
      cost_cents_yes: string;
      cost_cents_no: string;
    }>(
      `
        SELECT shares_yes, shares_no, cost_cents_yes, cost_cents_no
        FROM positions
        WHERE user_id = $1 AND market_id = $2
        FOR UPDATE
      `,
      [user.id, market.id]
    );
    const position = positionRes.rows[0] ?? {
      shares_yes: 0,
      shares_no: 0,
      cost_cents_yes: "0",
      cost_cents_no: "0"
    };

    let deltaShares: number;
    if (parsed.data.amountType === "SHARES") {
      deltaShares = parsed.data.kind === "BUY" ? parsed.data.amount : -parsed.data.amount;
    } else {
      const maxCostCents = creditsToCents(parsed.data.amount);
      if (maxCostCents <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
      }
      if (balanceCents < maxCostCents) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Insufficient balance." },
          { status: 400 }
        );
      }
      deltaShares = findDeltaSharesForMaxCostCents({
        b,
        qYes,
        qNo,
        side,
        maxCostCents
      });
      if (deltaShares <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Trade too small for that budget." },
          { status: 400 }
        );
      }
    }

    if (parsed.data.kind === "SELL") {
      const held = side === "YES" ? position.shares_yes : position.shares_no;
      if (held + 1e-9 < -deltaShares) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Not enough shares to sell." },
          { status: 400 }
        );
      }
    }

    const costCents = costCentsForDelta({ b, qYes, qNo, side, deltaShares });
    if (parsed.data.kind === "BUY" && costCents <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Trade too small." },
        { status: 400 }
      );
    }
    if (parsed.data.kind === "SELL" && costCents >= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Nothing to receive." },
        { status: 400 }
      );
    }
    if (parsed.data.kind === "BUY" && balanceCents < costCents) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Insufficient balance." },
        { status: 400 }
      );
    }

    const nextQYes = side === "YES" ? qYes + deltaShares : qYes;
    const nextQNo = side === "NO" ? qNo + deltaShares : qNo;
    const volumeDeltaCents = Math.abs(costCents);

    await client.query(
      `
        UPDATE markets
        SET
          q_yes = $1,
          q_no = $2,
          volume_cents = volume_cents + $3
        WHERE id = $4
      `,
      [nextQYes, nextQNo, volumeDeltaCents, market.id]
    );

    const tradeRes = await client.query<{ id: string; created_at: string }>(
      `
        INSERT INTO trades (user_id, market_id, side, delta_shares, cost_cents)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
      `,
      [user.id, market.id, side, deltaShares, costCents]
    );
    const tradeId = tradeRes.rows[0].id;

    if (side === "YES") {
      await client.query(
        `
          INSERT INTO positions (user_id, market_id, shares_yes, cost_cents_yes)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, market_id) DO UPDATE
          SET
            shares_yes = positions.shares_yes + EXCLUDED.shares_yes,
            cost_cents_yes = positions.cost_cents_yes + EXCLUDED.cost_cents_yes
        `,
        [user.id, market.id, deltaShares, costCents]
      );
    } else {
      await client.query(
        `
          INSERT INTO positions (user_id, market_id, shares_no, cost_cents_no)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, market_id) DO UPDATE
          SET
            shares_no = positions.shares_no + EXCLUDED.shares_no,
            cost_cents_no = positions.cost_cents_no + EXCLUDED.cost_cents_no
        `,
        [user.id, market.id, deltaShares, costCents]
      );
    }

    const updatedUserRes = await client.query<{ balance_cents: string }>(
      `
        UPDATE users
        SET balance_cents = balance_cents - $1
        WHERE id = $2
        RETURNING balance_cents
      `,
      [costCents, user.id]
    );
    balanceCents = Number(updatedUserRes.rows[0].balance_cents);

    await client.query(
      `
        INSERT INTO ledger_entries (user_id, market_id, type, amount_cents, ref_trade_id)
        VALUES ($1, $2, 'TRADE', $3, $4)
      `,
      [user.id, market.id, -costCents, tradeId]
    );

    const updatedPositionRes = await client.query<{
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

    await client.query("COMMIT");

    const priceYes = lmsrPriceYes(b, nextQYes, nextQNo);

    return NextResponse.json({
      ok: true,
      trade: { id: tradeId, side, deltaShares, costCents },
      market: { id: market.id, qYes: nextQYes, qNo: nextQNo, priceYes },
      user: { balanceCents },
      position: updatedPositionRes.rows[0]
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trade failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
