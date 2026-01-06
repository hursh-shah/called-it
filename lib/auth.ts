import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { getPool } from "./db";

const SESSION_COOKIE = "cm_session";
const SESSION_TTL_DAYS = 30;

export type CurrentUser = {
  id: string;
  username: string;
  isAdmin: boolean;
  balanceCents: number;
  lastAllowanceYm: number | null;
};

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function getMonthlyAllowanceCents() {
  const raw = process.env.MONTHLY_ALLOWANCE_CREDITS ?? "100";
  const credits = Number(raw);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new Error("Invalid MONTHLY_ALLOWANCE_CREDITS.");
  }
  return Math.round(credits * 100);
}

export function currentYm(now = new Date()) {
  return now.getUTCFullYear() * 12 + (now.getUTCMonth() + 1);
}

export async function grantMonthlyAllowanceTx(
  client: PoolClient,
  user: { id: string; lastAllowanceYm: number | null }
) {
  const nowYm = currentYm();
  const monthsToGrant =
    user.lastAllowanceYm == null ? 1 : Math.max(0, nowYm - user.lastAllowanceYm);
  if (monthsToGrant <= 0) {
    return { nowYm, monthsToGrant, allowanceCents: 0 };
  }

  const allowanceCents = monthsToGrant * getMonthlyAllowanceCents();
  await client.query(
    `
      UPDATE users
      SET
        balance_cents = balance_cents + $1,
        last_allowance_ym = $2
      WHERE id = $3
    `,
    [allowanceCents, nowYm, user.id]
  );
  await client.query(
    `
      INSERT INTO ledger_entries (user_id, type, amount_cents, note)
      VALUES ($1, 'ALLOWANCE', $2, $3)
    `,
    [user.id, allowanceCents, `Monthly allowance x${monthsToGrant}`]
  );

  return { nowYm, monthsToGrant, allowanceCents };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const pool = getPool();
  const tokenHash = hashSessionToken(token);
  const res = await pool.query<{
    id: string;
    username: string;
    is_admin: boolean;
    balance_cents: string;
    last_allowance_ym: number | null;
  }>(
    `
      SELECT
        u.id,
        u.username,
        u.is_admin,
        u.balance_cents,
        u.last_allowance_ym
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()
      LIMIT 1
    `,
    [tokenHash]
  );

  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    isAdmin: row.is_admin,
    balanceCents: Number(row.balance_cents),
    lastAllowanceYm: row.last_allowance_ym
  };
}
