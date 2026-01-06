import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createSessionToken,
  grantMonthlyAllowanceTx,
  hashSessionToken
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
  token: z.string().trim().min(1)
});

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function normalizeInvite(token: string) {
  const userToken = process.env.INVITE_TOKEN;
  const adminToken = process.env.ADMIN_INVITE_TOKEN;
  if (!userToken || !adminToken) {
    throw new Error("Missing INVITE_TOKEN or ADMIN_INVITE_TOKEN in environment.");
  }
  const isAdmin = safeEqual(token, adminToken);
  const isUser = safeEqual(token, userToken);
  if (!isAdmin && !isUser) return null;
  return { isAdmin };
}

export async function POST(req: Request) {
  const parsed = LoginBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const invite = normalizeInvite(parsed.data.token);
  if (!invite) {
    return NextResponse.json({ error: "Invalid invite token." }, { status: 401 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{
      id: string;
      is_admin: boolean;
      balance_cents: string;
      last_allowance_ym: number | null;
    }>(
      `
        SELECT id, is_admin, balance_cents, last_allowance_ym
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

    if (existing.rowCount === 0) {
      const inserted = await client.query<{
        id: string;
        is_admin: boolean;
        balance_cents: string;
        last_allowance_ym: number | null;
      }>(
        `
          INSERT INTO users (username, is_admin)
          VALUES ($1, $2)
          RETURNING id, is_admin, balance_cents, last_allowance_ym
        `,
        [parsed.data.username, invite.isAdmin]
      );
      userId = inserted.rows[0].id;
      isAdmin = inserted.rows[0].is_admin;
      balanceCents = Number(inserted.rows[0].balance_cents);
      lastAllowanceYm = inserted.rows[0].last_allowance_ym;
    } else {
      userId = existing.rows[0].id;
      isAdmin = existing.rows[0].is_admin;
      balanceCents = Number(existing.rows[0].balance_cents);
      lastAllowanceYm = existing.rows[0].last_allowance_ym;
      if (invite.isAdmin && !isAdmin) {
        const updated = await client.query<{ is_admin: boolean }>(
          "UPDATE users SET is_admin = true WHERE id = $1 RETURNING is_admin",
          [userId]
        );
        isAdmin = updated.rows[0].is_admin;
      }
    }

    const { nowYm, monthsToGrant } = await grantMonthlyAllowanceTx(client, {
      id: userId,
      lastAllowanceYm
    });
    if (monthsToGrant > 0) {
      const updated = await client.query<{ balance_cents: string }>(
        "SELECT balance_cents FROM users WHERE id = $1",
        [userId]
      );
      balanceCents = Number(updated.rows[0].balance_cents);
      lastAllowanceYm = nowYm;
    }

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
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Login failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
