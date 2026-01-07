import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DecideBody = z
  .object({
    action: z.enum(["ACCEPT", "REJECT"])
  })
  .strict();

export async function PATCH(
  req: Request,
  context: { params: { suggestionId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = DecideBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const nextStatus = parsed.data.action === "ACCEPT" ? "USED" : "REJECTED";

  const pool = getPool();
  const res = await pool.query<{ id: string; status: "PENDING" | "USED" | "REJECTED" }>(
    `
      UPDATE suggestions
      SET status = $2::suggestion_status
      WHERE id = $1 AND status = 'PENDING'
      RETURNING id, status
    `,
    [context.params.suggestionId, nextStatus]
  );

  if (res.rowCount === 0) {
    return NextResponse.json(
      { error: "Suggestion not found (or already handled)." },
      { status: 400 }
    );
  }

  return NextResponse.json({ suggestion: res.rows[0] });
}

