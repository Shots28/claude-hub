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

// Verify instance exists and get status (single-user: no ownership check)
async function getInstanceStatus(instanceId: string): Promise<{ exists: boolean; status?: string }> {
  const { data } = await (supabase.from("instances") as any)
    .select("id, status")
    .eq("id", instanceId)
    .maybeSingle();
  return { exists: !!data, status: data?.status };
}

// ---- GET: Fetch messages ----

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const { exists } = await getInstanceStatus(id);
  if (!exists) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 },
    );
  }

  try {
    console.log("[messages/GET] Fetching messages for instance:", id);

    // Fetch the LATEST messages by ordering DESC, then reverse for chronological display.
    // Previously ordered ASC with limit(500) which returned the oldest messages and
    // silently dropped recent ones once the instance exceeded 500 messages.
    const { data: rawData, error, count } = await supabase
      .from("chat_messages")
      .select("*", { count: "exact" })
      .eq("instance_id", id)
      .order("created_at", { ascending: false })
      .limit(500);

    // Reverse to chronological order (oldest first) for the client
    const data = rawData ? [...rawData].reverse() : rawData;

    if (error) {
      console.error("[messages/GET] DB error:", error);
      return NextResponse.json(
        { error: "Database error", details: error.message },
        { status: 500 },
      );
    }

    console.log(`[messages/GET] Returning ${data?.length ?? 0} messages (total count: ${count}) for instance ${id}`);
    // Debug: Log first few messages to verify data structure
    if (data && data.length > 0) {
      const sample = data.slice(0, 3).map((m: any) => ({
        id: m.id?.slice(0, 8),
        role: m.role,
        tool_name: m.tool_name,
        content_preview: m.content?.slice(0, 100),
        has_tool_fields: !!(m.tool_name || m.tool_id),
      }));
      console.log(`[messages/GET] Sample messages:`, JSON.stringify(sample));
    }

    // Return with cache-control headers to prevent stale data
    return NextResponse.json(
      {
        messages: data ?? [],
        _debug: {
          fetchedAt: new Date().toISOString(),
          instanceId: id,
          returnedCount: data?.length ?? 0,
          totalCount: count,
        }
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
        },
      }
    );
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

  const { exists, status: currentStatus } = await getInstanceStatus(id);
  if (!exists) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 },
    );
  }

  try {
    const body = await req.json();
    // Accept both "text" and "content" field names
    const textContent = (body.text || body.content || "").trim();
    const attachments = body.attachments || [];

    if (!textContent && attachments.length === 0) {
      return NextResponse.json(
        { error: "text/content or attachments required" },
        { status: 400 },
      );
    }

    // Build the content with embedded attachments for the bridge to parse
    // Format: text content followed by a JSON block with attachments
    let content = textContent;
    if (attachments.length > 0) {
      // Embed attachments as a special JSON block that the bridge will parse
      const attachmentBlock = `\n\n<!-- ATTACHMENTS_JSON:${JSON.stringify(attachments)}:END_ATTACHMENTS -->`;
      content = content + attachmentBlock;
    }

    // Insert into chat_messages (the realtime table)
    console.log("[messages/POST] Inserting user message for instance:", id, "content length:", content.length);
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

    console.log("[messages/POST] User message inserted successfully, id:", data?.id);

    // Only update status to "queued" if instance is idle/stopped
    // If already running or queued, leave status alone (message will be processed in order)
    const isAlreadyBusy = currentStatus === "running" || currentStatus === "queued";

    // Auto-name instance from first user message if the name is still the default repo folder name.
    // This gives instances human-readable names like "Fix the login bug" instead of "my-repo".
    const instanceUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (!isAlreadyBusy) {
      instanceUpdates.status = "queued";
    }

    // Check if this is the first user message — if so, auto-rename
    if (textContent) {
      const { count: msgCount } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("instance_id", id)
        .eq("role", "user");

      if (msgCount !== null && msgCount <= 1) {
        // First user message — get current instance name to check if it's a default folder name
        const { data: inst } = await (supabase.from("instances") as any)
          .select("name, repo_path")
          .eq("id", id)
          .maybeSingle();

        if (inst) {
          const folderName = inst.repo_path?.split("/").pop() || "";
          const isDefaultName = inst.name === folderName
            || inst.name.match(new RegExp(`^${folderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\(\\d+\\))?$`));

          if (isDefaultName) {
            // Rename to a truncated version of the first message
            const autoName = textContent.slice(0, 80).replace(/\n/g, " ").trim();
            instanceUpdates.name = autoName;
            console.log(`[messages/POST] Auto-naming instance ${id}: "${inst.name}" → "${autoName}"`);
          }
        }
      }
    }

    await (supabase.from("instances") as any)
      .update(instanceUpdates)
      .eq("id", id);

    return NextResponse.json({ message: data, queued: isAlreadyBusy }, { status: 201 });
  } catch (err) {
    console.error("[messages/POST] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
