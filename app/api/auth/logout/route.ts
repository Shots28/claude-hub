// ---------------------------------------------------------------------------
// POST /api/auth/logout — Clear session cookie
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { clearAuthCookie, getSessionFromCookies } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Increment jwt_generation to invalidate all existing tokens (server-side logout)
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (session?.sub) {
    // Increment jwt_generation to invalidate all existing tokens
    await (supabase.from("users") as any)
      .update({ jwt_generation: (session.gen ?? 1) + 1 })
      .eq("id", session.sub)
      .catch(() => {});
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("Set-Cookie", clearAuthCookie());
  return response;
}
