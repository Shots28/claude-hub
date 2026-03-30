// ---------------------------------------------------------------------------
// GET /api/instances/[id]/sessions/local — List local Claude Code sessions
// These are sessions from the IDE that can be resumed in Claude Hub
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSessionFromCookies } from "@/lib/auth";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

type RouteContext = { params: Promise<{ id: string }> };

interface LocalSession {
  id: string;
  preview: string;
  messageCount: number;
  lastActivityAt: string;
  createdAt: string;
  source: "ide" | "hub";
}

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

// Convert repo path to Claude project key format
function repoPathToProjectKey(repoPath: string): string {
  return repoPath.replace(/\//g, "-");
}

// Parse a session file to extract metadata
async function parseSessionFile(filePath: string, sessionId: string): Promise<LocalSession | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    if (lines.length === 0) return null;

    let firstUserMessage = "";
    let lastTimestamp = "";
    let firstTimestamp = "";
    let userCount = 0;
    let assistantCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Track timestamps
        if (entry.timestamp) {
          if (!firstTimestamp) firstTimestamp = entry.timestamp;
          lastTimestamp = entry.timestamp;
        }

        // Count messages
        if (entry.type === "user") {
          userCount++;
          if (!firstUserMessage && entry.message?.content) {
            const content = entry.message.content;
            if (typeof content === "string") {
              firstUserMessage = content.slice(0, 100);
            } else if (Array.isArray(content)) {
              const textBlock = content.find((c: any) => c.type === "text");
              if (textBlock?.text) {
                firstUserMessage = textBlock.text.slice(0, 100);
              }
            }
          }
        } else if (entry.type === "assistant") {
          assistantCount++;
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (userCount === 0 && assistantCount === 0) return null;

    return {
      id: sessionId,
      preview: firstUserMessage || "No preview available",
      messageCount: userCount + assistantCount,
      lastActivityAt: lastTimestamp || new Date().toISOString(),
      createdAt: firstTimestamp || new Date().toISOString(),
      source: "ide",
    };
  } catch (err) {
    console.error(`[sessions/local] Error parsing ${filePath}:`, err);
    return null;
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Get instance to find repo_path
  const { data: inst } = await (supabase.from("instances") as any)
    .select("id, repo_path, current_session_id")
    .eq("id", id)
    .maybeSingle();

  if (!inst) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  try {
    const projectKey = repoPathToProjectKey(inst.repo_path);
    const projectDir = join(homedir(), ".claude", "projects", projectKey);

    let files: string[] = [];
    try {
      const entries = await readdir(projectDir);
      // Only get .jsonl files that look like session IDs (UUID format, not agent-* files)
      files = entries.filter(f =>
        f.endsWith(".jsonl") &&
        !f.startsWith("agent-") &&
        /^[0-9a-f-]+\.jsonl$/.test(f)
      );
    } catch {
      // Directory doesn't exist
      return NextResponse.json({
        sessions: [],
        currentSessionId: inst.current_session_id,
        projectDir
      });
    }

    // Parse each session file
    const sessions: LocalSession[] = [];
    for (const file of files) {
      const sessionId = file.replace(".jsonl", "");
      const filePath = join(projectDir, file);

      // Get file stats for sorting
      const fileStat = await stat(filePath).catch(() => null);
      if (!fileStat) continue;

      const parsed = await parseSessionFile(filePath, sessionId);
      if (parsed) {
        sessions.push(parsed);
      }
    }

    // Sort by last activity (most recent first)
    sessions.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    // Mark current session
    const currentSessionId = inst.current_session_id;

    return NextResponse.json({
      sessions,
      currentSessionId,
      projectDir,
    });
  } catch (err) {
    console.error("[sessions/local] Error:", err);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}
