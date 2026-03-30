// ---------------------------------------------------------------------------
// POST /api/sessions/import — Import a desktop session into Claude Hub
// Creates an instance if needed, sets the session ID, and signals the bridge
// to import messages from the local JSONL file.
// NOTE: Session files live on the bridge machine. This endpoint only does DB
// operations; the bridge handles file I/O via the session_import_requests table.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

export async function POST(req: NextRequest) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sessionId, repoPath, repoName, preview } = body;

    if (!sessionId || !repoPath) {
      return NextResponse.json(
        { error: "sessionId and repoPath are required" },
        { status: 400 }
      );
    }

    // Normalize repo path (remove trailing slash) to prevent duplicates
    const normalizedPath = repoPath.replace(/\/+$/, "");

    // Derive a name: prefer session preview (first user prompt), fall back to repo name
    const folderName = repoName || normalizedPath.split("/").pop() || "Unnamed";
    const instanceName = preview
      ? preview.slice(0, 80).replace(/\n/g, " ").trim()
      : folderName;

    // Find or create instance for this repo
    let instance: any;
    const { data: existingInstances } = await (supabase.from("instances") as any)
      .select("id, current_session_id")
      .eq("repo_path", normalizedPath)
      .limit(1);
    const existingInst = existingInstances?.[0] ?? null;

    if (existingInst) {
      instance = existingInst;
    } else {
      // Create new instance — name from session preview or repo folder
      const { data: newInst, error: createError } = await (supabase.from("instances") as any)
        .insert({
          id: randomUUID(),
          name: instanceName,
          repo_path: normalizedPath,
          status: "idle",
          permission_mode: "bypassPermissions",
          allowed_tools: [],
          model: "sonnet",
          max_thinking_tokens: 0,
        })
        .select()
        .single();

      if (createError) {
        console.error("[sessions/import] Create instance error:", JSON.stringify(createError));
        return NextResponse.json(
          { error: "Failed to create instance", details: createError.message },
          { status: 500 }
        );
      }
      instance = newInst;
    }

    // Update instance with new session ID
    const { error: updateError } = await (supabase.from("instances") as any)
      .update({ current_session_id: sessionId })
      .eq("id", instance.id);

    if (updateError) {
      console.error("[sessions/import] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
    }

    // Bridge detects session_id changes via Realtime and imports messages
    // from the local JSONL file automatically — no extra coordination needed.

    return NextResponse.json({
      success: true,
      instanceId: instance.id,
      importPending: true,
    });
  } catch (err) {
    console.error("[sessions/import] Error:", err);
    return NextResponse.json(
      { error: "Failed to import session" },
      { status: 500 }
    );
  }
}
