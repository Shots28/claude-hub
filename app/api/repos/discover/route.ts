// ---------------------------------------------------------------------------
// GET /api/repos/discover — Return discovered repos from Supabase
// The local bridge scans the filesystem and syncs results to the DB.
// This route just reads from the DB so it works on Vercel too.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 },
      );
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/discovered_repos?select=name,path&order=name.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[repos/discover] Supabase error:", text);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    const repos = await res.json();
    return NextResponse.json({ repos }, { status: 200 });
  } catch (err) {
    console.error("[repos/discover] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
