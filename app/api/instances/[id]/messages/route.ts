// ---------------------------------------------------------------------------
// GET  /api/instances/[id]/messages — Fetch messages for an instance
// POST /api/instances/[id]/messages — Send a new user message
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";
import { randomUUID } from "node:crypto";

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

// Verify instance belongs to user
async function verifyOwnership(instanceId: string, userId: string) {
  const { data } = await supabase
    .from("instances")
    .select("id")
    .eq("id", instanceId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// ---- GET: Fetch messages ----

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!(await verifyOwnership(id, session.sub))) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 },
    );
  }

  try {
    // Fetch the last 100 messages
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("instance_id", id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[messages/GET] DB error:", error);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    return NextResponse.json({ messages: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error("[messages/GET] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---- POST: Send a new user message ----

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!(await verifyOwnership(id, session.sub))) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 },
    );
  }

  try {
    const body = await req.json();
    const { content } = body as { content?: string };

    if (!content?.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    const messageId = randomUUID();

    const { data, error } = await supabase
      .from("messages")
      .insert({
        id: messageId,
        instance_id: id,
        role: "user",
        content: content.trim(),
        tool_name: null,
        tool_id: null,
        is_error: false,
      })
      .select()
      .single();

    if (error) {
      console.error("[messages/POST] DB insert error:", error);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 },
      );
    }

    // Update the instance's last message preview and activity
    await supabase
      .from("instances")
      .update({
        last_message_preview: content.trim().slice(0, 100),
        last_activity_at: new Date().toISOString(),
        status: "queued",
      })
      .eq("id", id);

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (err) {
    console.error("[messages/POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
