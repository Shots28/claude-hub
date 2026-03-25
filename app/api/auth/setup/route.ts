// ---------------------------------------------------------------------------
// POST /api/auth/setup — First-time password setup
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ needsSetup: !existing });
  } catch {
    return NextResponse.json({ needsSetup: true });
  }
}

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

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Check if an auth row already exists
    const { data: existing, error: fetchError } = await supabase
      .from("users")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("[auth/setup] DB read error:", fetchError);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: "Already configured" },
        { status: 409 },
      );
    }

    // Hash password and insert
    const passwordHash = await hashPassword(password);

    const { error: insertError } = await supabase.from("users").insert({
      username,
      password_hash: passwordHash,
    });

    if (insertError) {
      console.error("[auth/setup] DB insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[auth/setup] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
