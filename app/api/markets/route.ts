import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "../../../lib/auth";
import { getPool } from "../../../lib/db";
import { lmsrPriceYes } from "../../../lib/lmsr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateMarketBody = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional().default(""),
    rules: z.string().trim().min(1).max(4000),
    involvedUserIds: z.array(z.string().uuid()).max(50).optional().default([]),
    suggestionId: z.string().uuid().optional(),
    closesAt: z.string().datetime(),
    resolvesAt: z.string().datetime(),
    b: z.coerce.number().positive(),
    initialProbability: z.coerce.number().min(0.01).max(0.99).optional()
  })
  .strict()
  .refine((v) => new Date(v.closesAt) < new Date(v.resolvesAt), {
    message: "resolvesAt must be after closesAt"
  });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = getPool();
  const res = await pool.query<{
    id: string;
    title: string;
    description: string;
    closes_at: string;
    resolves_at: string;
    status: "OPEN" | "CLOSED" | "RESOLVED";
    outcome: "YES" | "NO" | null;
    b: number;
    q_yes: number;
    q_no: number;
    volume_cents: string;
    created_at: string;
  }>(
    `
      SELECT
        id,
        title,
        description,
        closes_at,
        resolves_at,
        status,
        outcome,
        b,
        q_yes,
        q_no,
        volume_cents,
        created_at
      FROM markets
      ORDER BY created_at DESC
      LIMIT 100
    `
  );

  return NextResponse.json({
    markets: res.rows.map((m) => ({
      ...m,
      volume_cents: Number(m.volume_cents),
      price_yes: lmsrPriceYes(m.b, m.q_yes, m.q_no)
    }))
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateMarketBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const p = parsed.data.initialProbability ?? 0.5;
  const d = parsed.data.b * Math.log(p / (1 - p));
  const qYes = d >= 0 ? d : 0;
  const qNo = d >= 0 ? 0 : -d;

  const pool = getPool();
  const involvedUserIds = Array.from(new Set(parsed.data.involvedUserIds ?? []));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (involvedUserIds.length > 0) {
      const usersRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM users
          WHERE id = ANY($1::uuid[])
        `,
        [involvedUserIds]
      );
      if (usersRes.rowCount !== involvedUserIds.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "One or more involved users were not found." },
          { status: 400 }
        );
      }
    }

    const marketRes = await client.query<{
      id: string;
      title: string;
      description: string;
      rules: string;
      closes_at: string;
      resolves_at: string;
      status: "OPEN" | "CLOSED" | "RESOLVED";
      outcome: "YES" | "NO" | null;
      b: number;
      q_yes: number;
      q_no: number;
      volume_cents: string;
      created_at: string;
    }>(
      `
        INSERT INTO markets (
          title,
          description,
          rules,
          closes_at,
          resolves_at,
          b,
          q_yes,
          q_no,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          title,
          description,
          rules,
          closes_at,
          resolves_at,
          status,
          outcome,
          b,
          q_yes,
          q_no,
          volume_cents,
          created_at
      `,
      [
        parsed.data.title,
        parsed.data.description ?? "",
        parsed.data.rules,
        parsed.data.closesAt,
        parsed.data.resolvesAt,
        parsed.data.b,
        qYes,
        qNo,
        user.id
      ]
    );
    const market = marketRes.rows[0];

    if (involvedUserIds.length > 0) {
      await client.query(
        `
          INSERT INTO market_involved_users (market_id, user_id)
          SELECT $1, unnest($2::uuid[])
          ON CONFLICT (market_id, user_id) DO NOTHING
        `,
        [market.id, involvedUserIds]
      );
    }

    if (parsed.data.suggestionId) {
      const updated = await client.query<{ id: string }>(
        `
          UPDATE suggestions
          SET status = 'USED', market_id = $1, used_at = now()
          WHERE id = $2 AND status = 'PENDING'
          RETURNING id
        `,
        [market.id, parsed.data.suggestionId]
      );
      if (updated.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Suggestion not found (or already handled)." },
          { status: 400 }
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ market }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
