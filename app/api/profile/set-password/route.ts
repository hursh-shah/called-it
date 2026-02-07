import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, hashPassword } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SetPasswordBody = z.object({
  password: z.string().min(8, "Password must be at least 8 characters long.")
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = SetPasswordBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const passwordHash = await hashPassword(parsed.data.password);

    await client.query(
      `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
      `,
      [passwordHash, user.id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set password." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
