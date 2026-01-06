import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { hashSessionToken } from "../../../../lib/auth";
import { getPool } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const token = cookies().get("cm_session")?.value;

  if (token) {
    const pool = getPool();
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [
      hashSessionToken(token)
    ]);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "cm_session",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return res;
}
