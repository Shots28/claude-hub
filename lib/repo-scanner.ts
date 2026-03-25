// ---------------------------------------------------------------------------
// Repo Scanner — discovers local git repos and syncs to Supabase
// Runs on the local bridge so it has filesystem access
// ---------------------------------------------------------------------------

import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { getServerClient } from "./supabase";

interface DiscoveredRepo {
  name: string;
  path: string;
}

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

async function discoverRepos(): Promise<DiscoveredRepo[]> {
  const seen = new Set<string>();
  const repos: DiscoveredRepo[] = [];

  for (const dir of SCAN_DIRS) {
    const expanded = expandHome(dir);
    const found = await scanDirectory(expanded);
    for (const repo of found) {
      if (!seen.has(repo.path)) {
        seen.add(repo.path);
        repos.push(repo);
      }
    }
  }

  repos.sort((a, b) => a.name.localeCompare(b.name));
  return repos;
}

/**
 * Scan for local git repos and sync the list to Supabase.
 * Called on bridge startup and can be re-called to refresh.
 */
export async function syncDiscoveredRepos(): Promise<void> {
  try {
    const repos = await discoverRepos();
    console.log(`[repo-scanner] Found ${repos.length} local repos`);

    // Clear old entries and insert fresh list
    const db: any = getServerClient();
    await db.from("discovered_repos").delete().neq("path", "");

    if (repos.length > 0) {
      const rows = repos.map((r) => ({ path: r.path, name: r.name }));
      const { error } = await db.from("discovered_repos").upsert(rows);
      if (error) {
        console.error("[repo-scanner] Failed to sync repos:", error.message);
      } else {
        console.log(`[repo-scanner] Synced ${repos.length} repos to Supabase`);
      }
    }
  } catch (err) {
    console.error("[repo-scanner] Error:", (err as Error).message);
  }
}
