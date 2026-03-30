// ---------------------------------------------------------------------------
// GET  /api/repos/discover — Return discovered repos from Supabase
// POST /api/repos/discover — Trigger a fresh scan of local folders
// The local bridge scans the filesystem and syncs results to the DB.
// This route just reads from the DB so it works on Vercel too.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 },
      );
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/discovered_repos?select=name,path,is_git_repo&order=is_git_repo.desc,name.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[repos/discover] Supabase error:", text);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 },
      );
    }

    const repos = await res.json();
    return NextResponse.json({ repos }, { status: 200 });
  } catch (err) {
    console.error("[repos/discover] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/repos/discover — Trigger a fresh scan and sync to Supabase
// ---------------------------------------------------------------------------

const SCAN_DIRS = [
  "~/Projects", "~/projects", "~/Developer", "~/developer",
  "~/Development", "~/dev", "~/Dev", "~/repos", "~/Repos",
  "~/code", "~/Code", "~/src", "~/workspace", "~/Workspace",
  "~/work", "~/Work", "~/git", "~/GitHub", "~/github",
  "~/Desktop", "~/Documents", "~",
];

function expandHome(p: string): string {
  const home = homedir();
  if (p.startsWith("~/")) return join(home, p.slice(2));
  if (p === "~") return home;
  return p;
}

async function scanFolders(): Promise<{ name: string; path: string; is_git_repo: boolean }[]> {
  const seen = new Set<string>();
  const folders: { name: string; path: string; is_git_repo: boolean }[] = [];

  for (const dir of SCAN_DIRS) {
    const expanded = expandHome(dir);
    try {
      const entries = await readdir(expanded, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith(".")) continue;
        const fullPath = join(expanded, e.name);
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);

        let isGitRepo = false;
        try {
          await access(join(fullPath, ".git"));
          isGitRepo = true;
        } catch {}

        folders.push({ name: e.name, path: fullPath, is_git_repo: isGitRepo });
      }
    } catch {}
  }

  // Sort: git repos first, then alphabetically
  folders.sort((a, b) => {
    if (a.is_git_repo !== b.is_git_repo) return a.is_git_repo ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return folders;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies(req.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 },
      );
    }

    // Scan local folders
    const folders = await scanFolders();
    console.log(`[repos/discover] Scanned ${folders.length} folders`);

    // Clear existing and sync new
    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    // Delete all existing
    await fetch(`${supabaseUrl}/rest/v1/discovered_repos?path=neq.`, {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=minimal" },
    });

    // Insert new
    if (folders.length > 0) {
      const res = await fetch(`${supabaseUrl}/rest/v1/discovered_repos`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(folders),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[repos/discover] Sync failed:", text);
        return NextResponse.json({ error: "Sync failed" }, { status: 500 });
      }
    }

    const gitCount = folders.filter(f => f.is_git_repo).length;
    console.log(`[repos/discover] Synced ${folders.length} folders (${gitCount} git repos)`);

    return NextResponse.json({
      success: true,
      count: folders.length,
      gitRepos: gitCount,
    }, { status: 200 });
  } catch (err) {
    console.error("[repos/discover] Scan error:", err);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 },
    );
  }
}
