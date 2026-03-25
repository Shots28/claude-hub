// ---------------------------------------------------------------------------
// POST /api/instances/[id]/interrupt — Interrupt a running instance
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  const cookieHeader = req.headers.get("cookie");
  const session = await getSessionFromCookies(cookieHeader);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify ownership
    const { data: instance } = await supabase
      .from("instances")
      .select("id, status")
      .eq("id", id)
      .eq("user_id", session.sub)
      .maybeSingle();

    if (!instance) {
      return NextResponse.json(
        { error: "Instance not found" },
        { status: 404 },
      );
    }

    if (instance.status !== "running") {
      return NextResponse.json(
        { error: "Instance is not running" },
        { status: 409 },
      );
    }

    // Mark as interrupted — the server-side instance manager picks this up
    await supabase
      .from("instances")
      .update({
        status: "idle",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Insert a system message noting the interruption
    await supabase.from("messages").insert({
      instance_id: id,
      role: "system",
      content: "Instance was interrupted by user.",
      tool_name: null,
      tool_id: null,
      is_error: false,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[interrupt/POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
