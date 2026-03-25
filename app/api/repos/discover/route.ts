// ---------------------------------------------------------------------------
// GET /api/repos/discover — Scan local filesystem for git repositories
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { readdir, stat, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

interface DiscoveredRepo {
  name: string;
  path: string;
}

/** Directories to scan for git repos (relative to home dir, or absolute). */
const SCAN_DIRS = [
  "~/Projects",
  "~/projects",
  "~/Developer",
  "~/developer",
  "~/Development",
  "~/dev",
  "~/Dev",
  "~/repos",
  "~/Repos",
  "~/code",
  "~/Code",
  "~/src",
  "~/workspace",
  "~/Workspace",
  "~/work",
  "~/Work",
  "~/git",
  "~/GitHub",
  "~/github",
  "~/Desktop",
  "~/Documents",
  "~",
];

function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await access(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function scanDirectory(dir: string): Promise<DiscoveredRepo[]> {
  const repos: DiscoveredRepo[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const checks = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map(async (entry) => {
        const fullPath = join(dir, entry.name);
        if (await isGitRepo(fullPath)) {
          repos.push({ name: entry.name, path: fullPath });
        }
      });
    await Promise.all(checks);
  } catch {
    // Directory doesn't exist or not readable — skip
  }
  return repos;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies(
    req.headers.get("cookie"),
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const seen = new Set<string>();
    const repos: DiscoveredRepo[] = [];

    // Also check for home dir itself being a git repo (unlikely but possible)
    // and scan each candidate directory
    for (const dir of SCAN_DIRS) {
      const expanded = expandHome(dir);

      // For the home directory itself, only scan children (don't add ~ as a repo)
      const found = await scanDirectory(expanded);
      for (const repo of found) {
        if (!seen.has(repo.path)) {
          seen.add(repo.path);
          repos.push(repo);
        }
      }
    }

    // Sort alphabetically by name
    repos.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ repos }, { status: 200 });
  } catch (err) {
    console.error("[repos/discover] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
