// ---------------------------------------------------------------------------
// POST /api/instances/[id]/files — Request a file read via the bridge
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Verify instance exists
  const { data: inst } = await (supabase.from("instances") as any)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!inst) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const filePath = (body.file_path || "").trim();

    if (!filePath) {
      return NextResponse.json(
        { error: "file_path is required" },
        { status: 400 },
      );
    }

    // Create file_request row — bridge will pick it up via Realtime
    const { data, error } = await (supabase.from("file_requests") as any)
      .insert({
        instance_id: id,
        file_path: filePath,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[files/POST] DB insert error:", error);
      return NextResponse.json(
        { error: "Failed to create file request" },
        { status: 500 },
      );
    }

    return NextResponse.json({ file_request: data }, { status: 201 });
  } catch (err) {
    console.error("[files/POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
