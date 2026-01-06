import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";
import { creditsToCents } from "../../../../lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AdjustCreditsBody = z.object({
  userId: z.string().uuid(),
  deltaCredits: z.coerce.number(),
  note: z.string().trim().max(2000).optional()
});

export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!admin.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = AdjustCreditsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!Number.isFinite(parsed.data.deltaCredits) || parsed.data.deltaCredits === 0) {
    return NextResponse.json(
      { error: "deltaCredits must be a non-zero number." },
      { status: 400 }
    );
  }

  const deltaCents = creditsToCents(parsed.data.deltaCredits);
  if (deltaCents === 0) {
    return NextResponse.json(
      { error: "Adjustment too small." },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userRes = await client.query<{
      id: string;
      username: string;
      balance_cents: string;
    }>(
      `
        SELECT id, username, balance_cents
        FROM users
        WHERE id = $1
        FOR UPDATE
      `,
      [parsed.data.userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentBalanceCents = Number(user.balance_cents);
    const nextBalanceCents = currentBalanceCents + deltaCents;
    if (nextBalanceCents < 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Insufficient balance for this adjustment." },
        { status: 400 }
      );
    }

    const updatedRes = await client.query<{ balance_cents: string }>(
      `
        UPDATE users
        SET balance_cents = balance_cents + $1
        WHERE id = $2
        RETURNING balance_cents
      `,
      [deltaCents, user.id]
    );

    const noteRaw = parsed.data.note?.trim();
    const note = noteRaw
      ? `Admin adjustment by ${admin.username}: ${noteRaw}`
      : `Admin adjustment by ${admin.username}`;

    await client.query(
      `
        INSERT INTO ledger_entries (user_id, type, amount_cents, note)
        VALUES ($1, 'ALLOWANCE', $2, $3)
      `,
      [user.id, deltaCents, note]
    );

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username, balanceCents: Number(updatedRes.rows[0].balance_cents) }
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Adjustment failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

