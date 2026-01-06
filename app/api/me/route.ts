import { NextResponse } from "next/server";

import { getCurrentUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      balanceCents: user.balanceCents
    }
  });
}

