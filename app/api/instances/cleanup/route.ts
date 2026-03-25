// ---------------------------------------------------------------------------
// POST /api/instances/cleanup — Clean old sessions/messages (>30 days)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  const session = await getSessionFromCookies(cookieHeader);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();

    // Get instances owned by this user
    const { data: userInstances } = await supabase
      .from("instances")
      .select("id")
      .eq("user_id", session.sub);

    if (!userInstances || userInstances.length === 0) {
      return NextResponse.json(
        { message: "No instances to clean.", deleted: 0 },
        { status: 200 },
      );
    }

    const instanceIds = userInstances.map((i) => i.id);

    // Delete old messages
    const { count } = await supabase
      .from("messages")
      .delete({ count: "exact" })
      .in("instance_id", instanceIds)
      .lt("created_at", cutoff);

    // Delete old resolved permissions
    await supabase
      .from("pending_permissions")
      .delete()
      .in("instance_id", instanceIds)
      .neq("status", "pending")
      .lt("requested_at", cutoff);

    return NextResponse.json(
      {
        message: `Cleaned ${count ?? 0} old messages.`,
        deleted: count ?? 0,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[cleanup/POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 },
    );
  }
}
