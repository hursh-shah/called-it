import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createSessionToken,
  grantMonthlyAllowanceTx,
  hashSessionToken,
  verifyPassword
} from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_DAYS = 30;

const LoginBody = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, underscores only."),
  password: z.string().min(1, "Password is required.")
});

function safeMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : "Internal error.";
  if (msg.includes("postgres://") || msg.includes("postgresql://")) {
    return "Database configuration error. Check DATABASE_URL (Postgres URI) and redeploy.";
  }
  return msg;
}

export async function POST(req: Request) {
  const parsed = LoginBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let client: Awaited<ReturnType<ReturnType<typeof getPool>["connect"]>> | null =
    null;
  try {
    const pool = getPool();
    client = await pool.connect();
    await client.query("BEGIN");

    const existing = await client.query<{
      id: string;
      is_admin: boolean;
      balance_cents: string;
      last_allowance_ym: number | null;
      last_allowance_cents: string | null;
      password_hash: string | null;
    }>(
      `
        SELECT id, is_admin, balance_cents, last_allowance_ym, last_allowance_cents, password_hash
        FROM users
        WHERE username = $1
        FOR UPDATE
      `,
      [parsed.data.username]
    );

    let userId: string;
    let isAdmin: boolean;
    let balanceCents: number;
    let lastAllowanceYm: number | null;
    let lastAllowanceCents: number | null;

    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const user = existing.rows[0];

    // Check if user has set a password
    if (!user.password_hash) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Password not set. Please set a password in your profile first." },
        { status: 401 }
      );
    }

    // Verify password
    const passwordValid = await verifyPassword(parsed.data.password, user.password_hash);
    if (!passwordValid) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    userId = user.id;
    isAdmin = user.is_admin;
    balanceCents = Number(user.balance_cents);
    lastAllowanceYm = user.last_allowance_ym;
    lastAllowanceCents = user.last_allowance_cents
      ? Number(user.last_allowance_cents)
      : null;

    const { nowYm, monthsToGrant, allowanceCents, adjustmentCents } =
      await grantMonthlyAllowanceTx(client, {
      id: userId,
      lastAllowanceYm,
      lastAllowanceCents
    });
    if (monthsToGrant > 0) {
      lastAllowanceYm = nowYm;
    }

    // Refresh balance from database after allowance update
    const refreshedBalanceRes = await client.query<{ balance_cents: string }>(
      "SELECT balance_cents FROM users WHERE id = $1",
      [userId]
    );
    balanceCents = Number(refreshedBalanceRes.rows[0].balance_cents);

    const sessionToken = createSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    await client.query(
      `
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `,
      [userId, tokenHash, expiresAt.toISOString()]
    );

    await client.query("COMMIT");

    const res = NextResponse.json({
      user: { id: userId, username: parsed.data.username, isAdmin, balanceCents }
    });
    res.cookies.set({
      name: "cm_session",
      value: sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60
    });
    return res;
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    return NextResponse.json({ error: safeMessage(err) }, { status: 500 });
  } finally {
    client?.release();
  }
}
