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
    // Verify instance exists (single-user: no ownership check)
    const { data: instance } = await (supabase.from("instances") as any)
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (!instance) {
      return NextResponse.json(
        { error: "Instance not found" },
        { status: 404 },
      );
    }

    if (instance.status !== "running" && instance.status !== "queued") {
      return NextResponse.json(
        { error: "Instance is not running" },
        { status: 409 },
      );
    }

    // Mark as idle
    await (supabase.from("instances") as any)
      .update({
        status: "idle",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Insert a system message noting the interruption (into chat_messages)
    await (supabase.from("chat_messages") as any).insert({
      instance_id: id,
      role: "system",
      content: "Instance was interrupted by user.",
      status: "done",
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
