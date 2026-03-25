// ---------------------------------------------------------------------------
// GET /api/bridge/status — Check if the local bridge is online
// Reads from the dedicated bridge_status table (updated every 15s by bridge)
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
      return NextResponse.json({ online: false, lastHeartbeat: null });
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/bridge_status?id=eq.default&select=last_heartbeat_at,status`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json({ online: false, lastHeartbeat: null });
    }

    const rows = await res.json();
    if (!rows?.length) {
      return NextResponse.json({ online: false, lastHeartbeat: null });
    }

    const { last_heartbeat_at } = rows[0];
    const age = Date.now() - new Date(last_heartbeat_at).getTime();
    const online = age < 60_000; // Online if heartbeat < 60s old

    return NextResponse.json({
      online,
      lastHeartbeat: last_heartbeat_at,
    });
  } catch {
    return NextResponse.json({ online: false, lastHeartbeat: null });
  }
}
