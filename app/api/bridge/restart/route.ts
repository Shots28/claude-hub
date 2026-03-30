// ---------------------------------------------------------------------------
// POST /api/bridge/restart — Request a remote bridge restart
// Sets restart_requested_at in bridge_status; the bridge detects this via
// Realtime and exits gracefully. The wrapper script (bridge.sh) restarts it.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/bridge_status?id=eq.default`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          restart_requested_at: new Date().toISOString(),
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "Failed to request restart", details: text }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Restart requested — bridge will restart shortly" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
