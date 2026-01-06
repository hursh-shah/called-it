import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "../../../lib/auth";
import { getPool } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSuggestionBody = z
  .object({
    title: z.string().trim().min(3).max(120),
    details: z.string().trim().max(4000).optional().default("")
  })
  .strict();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = getPool();
  const res = await pool.query<{
    id: string;
    title: string;
    details: string;
    status: "PENDING" | "USED" | "REJECTED";
    created_at: string;
    created_by: string;
    username: string;
    market_id: string | null;
    used_at: string | null;
  }>(
    user.isAdmin
      ? `
          SELECT
            s.id,
            s.title,
            s.details,
            s.status,
            s.created_at,
            s.created_by,
            u.username,
            s.market_id,
            s.used_at
          FROM suggestions s
          JOIN users u ON u.id = s.created_by
          ORDER BY s.created_at DESC
          LIMIT 200
        `
      : `
          SELECT
            s.id,
            s.title,
            s.details,
            s.status,
            s.created_at,
            s.created_by,
            u.username,
            s.market_id,
            s.used_at
          FROM suggestions s
          JOIN users u ON u.id = s.created_by
          WHERE s.created_by = $1
          ORDER BY s.created_at DESC
          LIMIT 200
        `,
    user.isAdmin ? undefined : [user.id]
  );

  return NextResponse.json({
    suggestions: res.rows.map((s) => ({
      id: s.id,
      title: s.title,
      details: s.details,
      status: s.status,
      createdAt: s.created_at,
      createdBy: { id: s.created_by, username: s.username },
      marketId: s.market_id,
      usedAt: s.used_at
    }))
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateSuggestionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const pool = getPool();
  const res = await pool.query<{
    id: string;
    title: string;
    details: string;
    status: "PENDING" | "USED" | "REJECTED";
    created_at: string;
  }>(
    `
      INSERT INTO suggestions (title, details, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, title, details, status, created_at
    `,
    [parsed.data.title, parsed.data.details ?? "", user.id]
  );

  return NextResponse.json({ suggestion: res.rows[0] }, { status: 201 });
}

