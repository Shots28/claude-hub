// ---------------------------------------------------------------------------
// GET /api/auth/check — Check if any user account exists
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[auth/check] DB error:", error);
      return NextResponse.json(
        { hasUser: false, needsSetup: true },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { hasUser: !!data, needsSetup: !data },
      { status: 200 },
    );
  } catch (err) {
    console.error("[auth/check] Unexpected error:", err);
    return NextResponse.json(
      { hasUser: false, needsSetup: true },
      { status: 200 },
    );
  }
}
