// ---------------------------------------------------------------------------
// GET /api/sessions/all — List ALL local Claude Code sessions across all repos
// Used by GlobalSessionPicker to show desktop sessions on the chats page
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface LocalSession {
  id: string;
  preview: string;
  messageCount: number;
  lastActivityAt: string;
  repoPath: string;
  repoName: string;
}

async function authenticate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  return getSessionFromCookies(cookieHeader);
}

// Convert project key back to repo path
function projectKeyToRepoPath(key: string): string {
  return key.replace(/-/g, "/");
}

// Parse a session file to extract metadata
async function parseSessionFile(
  filePath: string,
  sessionId: string,
  repoPath: string,
  repoName: string
): Promise<LocalSession | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    if (lines.length === 0) return null;

    let firstUserMessage = "";
    let lastTimestamp = "";
    let userCount = 0;
    let assistantCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (entry.timestamp) {
          lastTimestamp = entry.timestamp;
        }

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
      repoPath,
      repoName,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projectsDir = join(homedir(), ".claude", "projects");
    let projectDirs: string[] = [];

    try {
      const entries = await readdir(projectsDir, { withFileTypes: true });
      projectDirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith("-"))
        .map(e => e.name);
    } catch {
      return NextResponse.json({ sessions: [] });
    }

    const allSessions: LocalSession[] = [];

    for (const projectDir of projectDirs) {
      const projectPath = join(projectsDir, projectDir);
      const repoPath = projectKeyToRepoPath(projectDir);
      const repoName = repoPath.split("/").pop() || projectDir;

      try {
        const files = await readdir(projectPath);
        const sessionFiles = files.filter(f =>
          f.endsWith(".jsonl") &&
          !f.startsWith("agent-") &&
          /^[0-9a-f-]+\.jsonl$/.test(f)
        );

        for (const file of sessionFiles) {
          const sessionId = file.replace(".jsonl", "");
          const filePath = join(projectPath, file);

          // Get file stats for filtering old sessions
          const fileStat = await stat(filePath).catch(() => null);
          if (!fileStat) continue;

          // Only include sessions from last 30 days
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          if (fileStat.mtimeMs < thirtyDaysAgo) continue;

          const parsed = await parseSessionFile(filePath, sessionId, repoPath, repoName);
          if (parsed) {
            allSessions.push(parsed);
          }
        }
      } catch {
        // Skip inaccessible project dirs
      }
    }

    // Sort by last activity (most recent first)
    allSessions.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    // Limit to 50 most recent
    return NextResponse.json({
      sessions: allSessions.slice(0, 50),
    });
  } catch (err) {
    console.error("[sessions/all] Error:", err);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}
