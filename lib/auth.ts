import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { getPool } from "./db";

const SESSION_COOKIE = "cm_session";

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

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt.toString("hex") + ":" + derivedKey.toString("hex"));
    });
  });
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [saltHex, keyHex] = hash.split(":");
    if (!saltHex || !keyHex) {
      resolve(false);
      return;
    }
    const salt = Buffer.from(saltHex, "hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      const keyBuffer = Buffer.from(keyHex, "hex");
      resolve(crypto.timingSafeEqual(derivedKey, keyBuffer));
    });
  });
}

export function getMonthlyAllowanceCents() {
  const raw = process.env.MONTHLY_ALLOWANCE_CREDITS ?? "500";
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
  user: { id: string; lastAllowanceYm: number | null; lastAllowanceCents: number | null }
) {
  const nowYm = currentYm();
  const monthlyAllowanceCents = getMonthlyAllowanceCents();

  const monthsToGrant =
    user.lastAllowanceYm == null ? 1 : Math.max(0, nowYm - user.lastAllowanceYm);

  if (monthsToGrant <= 0) {
    if (user.lastAllowanceYm !== nowYm) {
      return { nowYm, monthsToGrant: 0, allowanceCents: 0, adjustmentCents: 0 };
    }

    let appliedCents = user.lastAllowanceCents;

    if (appliedCents == null) {
      const lastRes = await client.query<{ amount_cents: string; note: string }>(
        `
          SELECT amount_cents, note
          FROM ledger_entries
          WHERE user_id = $1 AND type = 'ALLOWANCE' AND note LIKE 'Monthly allowance x%'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [user.id]
      );
      const last = lastRes.rows[0];
      if (last) {
        const match = last.note.match(/Monthly allowance x(\d+)/);
        const months = match ? Number(match[1]) : 1;
        const totalCents = Number(last.amount_cents);
        if (Number.isFinite(months) && months > 0 && Number.isFinite(totalCents)) {
          appliedCents = Math.trunc(totalCents / months);
        }
      }
    }

    if (appliedCents == null) {
      await client.query(
        `
          UPDATE users
          SET last_allowance_cents = $1
          WHERE id = $2 AND last_allowance_ym = $3 AND last_allowance_cents IS NULL
        `,
        [monthlyAllowanceCents, user.id, nowYm]
      );
      return { nowYm, monthsToGrant: 0, allowanceCents: 0, adjustmentCents: 0 };
    }

    if (appliedCents === monthlyAllowanceCents) {
      if (user.lastAllowanceCents == null) {
        await client.query(
          `
            UPDATE users
            SET last_allowance_cents = $1
            WHERE id = $2 AND last_allowance_ym = $3 AND last_allowance_cents IS NULL
          `,
          [monthlyAllowanceCents, user.id, nowYm]
        );
      }
      return { nowYm, monthsToGrant: 0, allowanceCents: 0, adjustmentCents: 0 };
    }

    const adjustmentCents = monthlyAllowanceCents - appliedCents;

    await client.query(
      `
        UPDATE users
        SET
          balance_cents = balance_cents + $1,
          last_allowance_cents = $2
        WHERE id = $3
      `,
      [adjustmentCents, monthlyAllowanceCents, user.id]
    );
    await client.query(
      `
        INSERT INTO ledger_entries (user_id, type, amount_cents, note)
        VALUES ($1, 'ALLOWANCE', $2, $3)
      `,
      [
        user.id,
        adjustmentCents,
        `Monthly allowance adjustment (${appliedCents / 100} → ${monthlyAllowanceCents / 100})`
      ]
    );

    return { nowYm, monthsToGrant: 0, allowanceCents: 0, adjustmentCents };
  }

  const allowanceCents = monthsToGrant * monthlyAllowanceCents;
  await client.query(
    `
      UPDATE users
      SET
        balance_cents = balance_cents + $1,
        last_allowance_ym = $2,
        last_allowance_cents = $3
      WHERE id = $4
    `,
    [allowanceCents, nowYm, monthlyAllowanceCents, user.id]
  );
  await client.query(
    `
      INSERT INTO ledger_entries (user_id, type, amount_cents, note)
      VALUES ($1, 'ALLOWANCE', $2, $3)
    `,
    [user.id, allowanceCents, `Monthly allowance x${monthsToGrant}`]
  );

  return { nowYm, monthsToGrant, allowanceCents, adjustmentCents: 0 };
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
