// ---------------------------------------------------------------------------
// GET /api/sessions/all — List ALL local Claude Code sessions across all repos
// Used by GlobalSessionPicker to show desktop sessions on the chats page
// NOTE: Reads from Supabase (synced by bridge) - works on Vercel
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

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

export async function GET(req: NextRequest) {
  const session = await authenticate(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    // Read sessions from Supabase (synced by bridge)
    const res = await fetch(
      `${supabaseUrl}/rest/v1/local_sessions?select=id,repo_path,repo_name,preview,message_count,last_activity_at&order=last_activity_at.desc&limit=50`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[sessions/all] Supabase error:", text);
      // Return empty list instead of error - table might not exist yet
      return NextResponse.json({ sessions: [] });
    }

    const data = await res.json();

    // Transform to frontend format
    const sessions: LocalSession[] = data.map((row: any) => ({
      id: row.id,
      preview: row.preview || "No preview",
      messageCount: row.message_count || 0,
      lastActivityAt: row.last_activity_at || new Date().toISOString(),
      repoPath: row.repo_path,
      repoName: row.repo_name,
    }));

    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[sessions/all] Error:", err);
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 500 }
    );
  }
}
