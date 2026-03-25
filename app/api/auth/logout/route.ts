// ---------------------------------------------------------------------------
// POST /api/auth/logout — Clear session cookie
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("Set-Cookie", clearAuthCookie());
  return response;
}
