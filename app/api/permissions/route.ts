// ---------------------------------------------------------------------------
// GET /api/permissions — Fetch all pending permission requests
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  const session = await getSessionFromCookies(cookieHeader);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("permission_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[permissions/GET] DB error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ permissions: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error("[permissions/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
