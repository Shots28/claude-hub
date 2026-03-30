// ---------------------------------------------------------------------------
// POST /api/sessions/import — Import a desktop session into Claude Hub
// Creates an instance if needed, switches to the session, imports messages
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

function repoPathToProjectKey(repoPath: string): string {
  return repoPath.replace(/\//g, "-");
}

export async function POST(req: NextRequest) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sessionId, repoPath, repoName } = body;

    if (!sessionId || !repoPath) {
      return NextResponse.json(
        { error: "sessionId and repoPath are required" },
        { status: 400 }
      );
    }

    // Verify session file exists
    const projectKey = repoPathToProjectKey(repoPath);
    const sessionPath = join(homedir(), ".claude", "projects", projectKey, `${sessionId}.jsonl`);

    let sessionContent: string;
    try {
      sessionContent = await readFile(sessionPath, "utf-8");
    } catch {
      return NextResponse.json({ error: "Session file not found" }, { status: 404 });
    }

    // Find or create instance for this repo
    let instance: any;
    const { data: existingInst } = await (supabase.from("instances") as any)
      .select("id, current_session_id")
      .eq("repo_path", repoPath)
      .maybeSingle();

    if (existingInst) {
      instance = existingInst;
    } else {
      // Create new instance
      const { data: newInst, error: createError } = await (supabase.from("instances") as any)
        .insert({
          name: repoName || repoPath.split("/").pop() || "Unnamed",
          repo_path: repoPath,
          status: "idle",
          permission_mode: "default",
        })
        .select()
        .single();

      if (createError) {
        console.error("[sessions/import] Create instance error:", createError);
        return NextResponse.json({ error: "Failed to create instance" }, { status: 500 });
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

    // Import messages to Supabase for display
    const lines = sessionContent.trim().split("\n").filter(Boolean);
    const messagesToInsert: any[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.type !== "user" && entry.type !== "assistant") continue;

        let content = "";
        const messageContent = entry.message?.content;

        if (typeof messageContent === "string") {
          content = messageContent;
        } else if (Array.isArray(messageContent)) {
          const textParts = messageContent
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text);
          content = textParts.join("\n");
        }

        if (!content) continue;

        messagesToInsert.push({
          instance_id: instance.id,
          role: entry.type === "user" ? "user" : "assistant",
          content,
          status: "done",
          created_at: entry.timestamp || new Date().toISOString(),
          tool_name: null,
          tool_id: null,
        });
      } catch {
        // Skip malformed lines
      }
    }

    if (messagesToInsert.length > 0) {
      // Clear existing messages for this instance
      await (supabase.from("chat_messages") as any)
        .delete()
        .eq("instance_id", instance.id);

      // Insert imported messages
      const { error: insertError } = await (supabase.from("chat_messages") as any)
        .insert(messagesToInsert);

      if (insertError) {
        console.error("[sessions/import] Insert error:", insertError);
        // Don't fail - messages are optional
      }
    }

    return NextResponse.json({
      success: true,
      instanceId: instance.id,
      importedMessages: messagesToInsert.length,
    });
  } catch (err) {
    console.error("[sessions/import] Error:", err);
    return NextResponse.json(
      { error: "Failed to import session" },
      { status: 500 }
    );
  }
}
