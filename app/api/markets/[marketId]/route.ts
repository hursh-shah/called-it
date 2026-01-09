import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InvolvedUserBan = z.object({
  userId: z.string().uuid(),
  ban: z.enum(["YES", "NO", "ALL"])
});

const UpdateMarketBody = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    rules: z.string().trim().min(1).max(4000).optional(),
    closesAt: z.string().datetime().optional(),
    resolvesAt: z.string().datetime().optional(),
    involvedUserBans: z.array(InvolvedUserBan).max(50).optional()
  })
  .strict();

export async function PATCH(
  req: Request,
  context: { params: { marketId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = UpdateMarketBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingRes = await client.query<{
      id: string;
      title: string;
      description: string;
      rules: string;
      closes_at: string;
      resolves_at: string;
      status: "OPEN" | "CLOSED" | "RESOLVED";
      outcome: "YES" | "NO" | null;
    }>(
      `
        SELECT id, title, description, rules, closes_at, resolves_at, status, outcome
        FROM markets
        WHERE id = $1
        FOR UPDATE
      `,
      [context.params.marketId]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    const isResolved = existing.status === "RESOLVED" || existing.outcome != null;
    if (isResolved && (parsed.data.closesAt || parsed.data.resolvesAt)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "Cannot change close/resolve time after resolution." },
        { status: 400 }
      );
    }

    const closesAt = parsed.data.closesAt ?? existing.closes_at;
    const resolvesAt = parsed.data.resolvesAt ?? existing.resolves_at;
    if (new Date(closesAt) >= new Date(resolvesAt)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "resolvesAt must be after closesAt" },
        { status: 400 }
      );
    }

    const title = parsed.data.title ?? existing.title;
    const description = parsed.data.description ?? existing.description;
    const rules = parsed.data.rules ?? existing.rules;

    const updatedRes = await client.query<{
      id: string;
      title: string;
      description: string;
      rules: string;
      closes_at: string;
      resolves_at: string;
      status: "OPEN" | "CLOSED" | "RESOLVED";
      outcome: "YES" | "NO" | null;
      created_at: string;
    }>(
      `
        UPDATE markets
        SET title = $1, description = $2, rules = $3, closes_at = $4, resolves_at = $5
        WHERE id = $6
        RETURNING id, title, description, rules, closes_at, resolves_at, status, outcome, created_at
      `,
      [title, description, rules, closesAt, resolvesAt, context.params.marketId]
    );

    if (parsed.data.involvedUserBans) {
      const uniqueByUserId = new Map<string, "YES" | "NO" | "ALL">();
      for (const row of parsed.data.involvedUserBans) {
        uniqueByUserId.set(row.userId, row.ban);
      }
      const userIds = Array.from(uniqueByUserId.keys());
      const bans = userIds.map((userId) => uniqueByUserId.get(userId) as "YES" | "NO" | "ALL");

      if (userIds.length > 0) {
        const usersRes = await client.query<{ id: string }>(
          `
            SELECT id
            FROM users
            WHERE id = ANY($1::uuid[])
          `,
          [userIds]
        );
        if (usersRes.rowCount !== userIds.length) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "One or more involved users were not found." },
            { status: 400 }
          );
        }
      }

      await client.query(
        `
          INSERT INTO market_involved_users (market_id, user_id, ban)
          SELECT $1, x.user_id, x.ban::market_trade_ban
          FROM unnest($2::uuid[], $3::text[]) AS x(user_id, ban)
          ON CONFLICT (market_id, user_id) DO UPDATE
          SET ban = EXCLUDED.ban
        `,
        [context.params.marketId, userIds, bans]
      );

      await client.query(
        `
          DELETE FROM market_involved_users
          WHERE market_id = $1 AND NOT (user_id = ANY($2::uuid[]))
        `,
        [context.params.marketId, userIds]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ market: updatedRes.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
