// ---------------------------------------------------------------------------
// POST /api/instances/[id]/sessions/switch — Switch to a different session
// This allows continuing a session from IDE in Claude Hub
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";
import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

type RouteContext = { params: Promise<{ id: string }> };

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

function repoPathToProjectKey(repoPath: string): string {
  return repoPath.replace(/\//g, "-");
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = await req.json();
    const { sessionId, importMessages = true } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Get instance
    const { data: inst } = await (supabase.from("instances") as any)
      .select("id, repo_path, current_session_id")
      .eq("id", id)
      .maybeSingle();

    if (!inst) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    // Verify session file exists
    const projectKey = repoPathToProjectKey(inst.repo_path);
    const sessionPath = join(homedir(), ".claude", "projects", projectKey, `${sessionId}.jsonl`);

    let sessionContent: string;
    try {
      sessionContent = await readFile(sessionPath, "utf-8");
    } catch {
      return NextResponse.json({ error: "Session file not found" }, { status: 404 });
    }

    // Update instance with new session ID
    const { error: updateError } = await (supabase.from("instances") as any)
      .update({ current_session_id: sessionId })
      .eq("id", id);

    if (updateError) {
      console.error("[sessions/switch] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
    }

    // Optionally import messages to Supabase for display
    let importedCount = 0;
    if (importMessages) {
      const lines = sessionContent.trim().split("\n").filter(Boolean);
      const messagesToInsert: any[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Only import user and assistant messages
          if (entry.type !== "user" && entry.type !== "assistant") continue;

          let content = "";
          const messageContent = entry.message?.content;

          if (typeof messageContent === "string") {
            content = messageContent;
          } else if (Array.isArray(messageContent)) {
            // Extract text from content blocks
            const textParts = messageContent
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text);
            content = textParts.join("\n");
          }

          if (!content) continue;

          messagesToInsert.push({
            instance_id: id,
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
        // Clear existing messages for this instance first
        await (supabase.from("chat_messages") as any)
          .delete()
          .eq("instance_id", id);

        // Insert imported messages
        const { error: insertError } = await (supabase.from("chat_messages") as any)
          .insert(messagesToInsert);

        if (insertError) {
          console.error("[sessions/switch] Insert error:", insertError);
        } else {
          importedCount = messagesToInsert.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      importedMessages: importedCount,
    });
  } catch (err) {
    console.error("[sessions/switch] Error:", err);
    return NextResponse.json(
      { error: "Failed to switch session" },
      { status: 500 }
    );
  }
}
