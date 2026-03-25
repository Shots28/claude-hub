// ---------------------------------------------------------------------------
// GET  /api/instances/[id]/messages — Fetch messages for an instance
// POST /api/instances/[id]/messages — Send a new user message
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

// Verify instance exists (single-user: no ownership check)
async function verifyInstance(instanceId: string) {
  const { data } = await (supabase.from("instances") as any)
    .select("id")
    .eq("id", instanceId)
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

  if (!(await verifyInstance(id))) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 },
    );
  }

  try {
    // Fetch from chat_messages (the realtime table, not the cache)
    const { data, error } = await supabase
      .from("chat_messages")
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

  if (!(await verifyInstance(id))) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 },
    );
  }

  try {
    const body = await req.json();
    // Accept both "text" and "content" field names
    const content = (body.text || body.content || "").trim();

    if (!content) {
      return NextResponse.json(
        { error: "text or content is required" },
        { status: 400 },
      );
    }

    // Insert into chat_messages (the realtime table)
    const { data, error } = await (supabase.from("chat_messages") as any)
      .insert({
        instance_id: id,
        role: "user",
        content,
        status: "done",
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

    // Update instance status to indicate activity
    await (supabase.from("instances") as any)
      .update({
        status: "queued",
        updated_at: new Date().toISOString(),
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
