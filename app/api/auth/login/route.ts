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
  password: z.string().optional(),
  inviteToken: z.string().optional()
});

function normalizeSecret(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name} in environment.`);
  const trimmed = value.trim();
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return unquoted.trim();
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function normalizeInvite(token: string) {
  const userToken = normalizeSecret(process.env.INVITE_TOKEN, "INVITE_TOKEN");
  const adminToken = normalizeSecret(
    process.env.ADMIN_INVITE_TOKEN,
    "ADMIN_INVITE_TOKEN"
  );
  const isAdmin = safeEqual(token, adminToken);
  const isUser = safeEqual(token, userToken);
  if (!isAdmin && !isUser) return null;
  return { isAdmin };
}

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

    const password = parsed.data.password?.trim();
    const inviteToken = parsed.data.inviteToken?.trim();

    if (!password && !inviteToken) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Enter your password or invite code." },
        { status: 400 }
      );
    }

    let authenticated = false;
    let inviteAttempted = false;

    if (password && user.password_hash) {
      authenticated = await verifyPassword(password, user.password_hash);
    }

    if (!authenticated && inviteToken) {
      inviteAttempted = true;

      let invite: { isAdmin: boolean } | null = null;
      try {
        invite = normalizeInvite(inviteToken);
      } catch (err) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: safeMessage(err) }, { status: 500 });
      }
      if (!invite) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Invalid invite token." },
          { status: 401 }
        );
      }

      authenticated = true;

      // Preserve the existing admin invite behavior for recognized users.
      if (invite.isAdmin && !user.is_admin) {
        await client.query<{ is_admin: boolean }>(
          "UPDATE users SET is_admin = true WHERE id = $1 RETURNING is_admin",
          [user.id]
        );
        user.is_admin = true;
      }
    }

    if (!authenticated) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error:
            user.password_hash || inviteAttempted
              ? "Invalid username or password."
              : "Password not set. Use your invite code to log in."
        },
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
