// ---------------------------------------------------------------------------
// POST /api/auth/login — Authenticate and set session cookie
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyPassword, signJwt, setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return NextResponse.json(
        { error: "username and password are required" },
        { status: 400 },
      );
    }

    // Fetch the user row
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle() as { data: { id: string; username: string; password_hash: string } | null; error: any };

    if (fetchError) {
      console.error("[auth/login] DB error:", fetchError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Sign JWT and set cookie
    const token = await signJwt({ sub: user.id, username: user.username });

    const response = NextResponse.json(
      { ok: true, user: { id: user.id, username: user.username } },
      { status: 200 },
    );

    response.headers.set("Set-Cookie", setAuthCookie(token));

    return response;
  } catch (err) {
    console.error("[auth/login] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
