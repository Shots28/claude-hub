// ---------------------------------------------------------------------------
// Claude Hub — Local Bridge Server
// Serves Next.js UI locally + bridges phone messages to Claude Code execution
// Run: set -a && source .env.local && set +a && node server.ts
//
// Known limitations:
// - Single-user only (no multi-user/multi-tenant support)
// - Bridge must be running locally for messages to be processed
// - No push notifications — uses polling + Supabase Realtime
// - No offline mode — requires active Supabase connection
// - Health metrics on Vercel show serverless stats, not bridge stats
// - No code diff viewer — assistant responses are plain text/markdown
// - MCP server path configurable via MCP_PLAN_REVIEW_PATH env var
// - Bridge heartbeat: uses dedicated bridge_status table
// ---------------------------------------------------------------------------

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import next from "next";
import { parse } from "url";
import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3100", 10);

// ---------------------------------------------------------------------------
// Next.js app
// ---------------------------------------------------------------------------

const app = next({ dev });
const handle = app.getRequestHandler();

// ---------------------------------------------------------------------------
// Repo Scanner
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

async function scanRepos(): Promise<{ name: string; path: string }[]> {
  const seen = new Set<string>();
  const repos: { name: string; path: string }[] = [];

  for (const dir of SCAN_DIRS) {
    const expanded = expandHome(dir);
    try {
      const entries = await readdir(expanded, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith(".")) continue;
        const fullPath = join(expanded, e.name);
        try {
          await access(join(fullPath, ".git"));
          if (!seen.has(fullPath)) {
            seen.add(fullPath);
            repos.push({ name: e.name, path: fullPath });
          }
        } catch {}
      }
    } catch {}
  }

  repos.sort((a, b) => a.name.localeCompare(b.name));
  return repos;
}

async function syncReposToSupabase(repos: { name: string; path: string }[]): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const restBase = `${supabaseUrl}/rest/v1/discovered_repos`;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  await fetch(`${restBase}?path=neq.`, { method: "DELETE", headers });

  if (repos.length > 0) {
    const res = await fetch(restBase, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(repos),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[repo-scanner] Sync failed:", text);
    } else {
      console.log(`[repo-scanner] Synced ${repos.length} repos to Supabase`);
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge — connects Supabase Realtime to local Claude Code execution
// ---------------------------------------------------------------------------

async function initBridge(
  server: ReturnType<typeof createServer>,
  repos: { name: string; path: string }[]
) {
  // --- Env validation ---
  const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET"];
  const envMissing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (envMissing.length > 0) {
    console.error(`[bridge] Missing env vars: ${envMissing.join(", ")}`);
    console.error("[bridge] Run: set -a && source .env.local && set +a && node server.ts");
    process.exit(1);
  }
  // No ANTHROPIC_API_KEY needed — the SDK uses your existing Claude Code
  // subscription auth from ~/.claude/

  // --- Import and instantiate InstanceManager ---
  // @ts-ignore — Node 22 native TS needs .ts extension, TS compiler disagrees
  const { InstanceManager } = await import("./lib/instance-manager.ts");
  const manager = new InstanceManager();

  const { createClient } = await import("@supabase/supabase-js");
  const bridgeSupabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // --- Build local instance ownership cache ---
  const localRepoPaths = new Set(repos.map((r) => r.path));
  const localInstanceIds = new Set<string>();

  let refreshTimer: NodeJS.Timeout | null = null;

  async function refreshLocalInstanceCache() {
    const { data: instances } = await bridgeSupabase
      .from("instances")
      .select("id, repo_path");
    localInstanceIds.clear();
    for (const inst of instances || []) {
      if (localRepoPaths.has(inst.repo_path)) {
        localInstanceIds.add(inst.id);
      }
    }
    console.log(`[bridge] Cached ${localInstanceIds.size} local instance IDs`);
  }

  function debouncedRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshLocalInstanceCache().catch(console.error);
    }, 5000);
  }

  await refreshLocalInstanceCache();

  // Refresh cache when instances are created or deleted
  bridgeSupabase
    .channel("bridge-instances")
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "instances",
    }, debouncedRefresh)
    .on("postgres_changes", {
      event: "DELETE",
      schema: "public",
      table: "instances",
    }, debouncedRefresh)
    .subscribe();

  // --- Reset stale "running" instances (scoped to local repos) ---
  if (localInstanceIds.size > 0) {
    const { data: stale } = await bridgeSupabase
      .from("instances")
      .select("id")
      .eq("status", "running")
      .in("id", Array.from(localInstanceIds));

    if (stale?.length) {
      await bridgeSupabase
        .from("instances")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .in("id", stale.map((s: any) => s.id));
      console.log(`[bridge] Reset ${stale.length} stale running instances to queued`);
    }
  }

  // Clean up orphaned streaming messages (left by crashed bridge)
  // Also reset any associated instances that are stuck in non-idle states
  const { data: orphanedMsgs } = await bridgeSupabase
    .from("chat_messages")
    .select("id, instance_id")
    .eq("status", "streaming");

  if (orphanedMsgs?.length) {
    await bridgeSupabase
      .from("chat_messages")
      .update({ status: "error", content: "[Bridge restarted — response interrupted]" })
      .eq("status", "streaming");

    // Reset associated instances to idle
    const orphanedInstanceIds = [...new Set(orphanedMsgs.map((m: any) => m.instance_id))];
    await bridgeSupabase
      .from("instances")
      .update({ status: "idle", error_message: "Bridge restarted during execution", updated_at: new Date().toISOString() })
      .in("id", orphanedInstanceIds)
      .eq("status", "running");

    console.log(`[bridge] Cleaned up ${orphanedMsgs.length} orphaned streaming messages`);
  }

  // --- Supabase Realtime subscription (primary trigger) ---
  const channel = bridgeSupabase
    .channel("bridge-messages")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: "role=eq.user",
      },
      async (payload: any) => {
        const { instance_id: instanceId, content } = payload.new;
        if (!instanceId || !content) return;

        // Only process local instances — check cache first, then DB fallback
        if (!localInstanceIds.has(instanceId)) {
          // Cache miss — check DB directly (handles race with newly created instances)
          const inst = await manager.getInstance(instanceId);
          if (!inst || !localRepoPaths.has(inst.repo_path)) return;
          // Update cache
          localInstanceIds.add(instanceId);
        }

        // Skip if already running
        if (manager.isRunning(instanceId)) {
          console.log(`[bridge] Instance ${instanceId} busy, skipping`);
          return;
        }

        console.log(`[bridge] Executing message for instance ${instanceId}`);
        try {
          await manager.sendMessage(instanceId, content);
        } catch (err) {
          console.error(`[bridge] Execution failed for ${instanceId}:`, err);
          try {
            await bridgeSupabase
              .from("instances")
              .update({
                status: "error",
                error_message: (err as Error).message,
                updated_at: new Date().toISOString(),
              })
              .eq("id", instanceId);
          } catch (dbErr) {
            console.error("[bridge] Failed to update error status:", dbErr);
          }
        }
      }
    )
    .subscribe((status: string) => {
      console.log(`[bridge] Realtime subscription: ${status}`);
    });

  // --- Periodic poll fallback (every 30s) ---
  // Deduplication: the poll only processes a queued instance if the latest message
  // has role="user" (i.e., no assistant reply yet). Once the bridge responds, the
  // latest message becomes role="assistant" and the poll won't re-trigger the same
  // message. This prevents duplicate processing without explicit tracking.
  const pollInterval = setInterval(async () => {
    try {
      if (localInstanceIds.size === 0) return;

      const { data: queued } = await bridgeSupabase
        .from("instances")
        .select("id")
        .eq("status", "queued")
        .in("id", Array.from(localInstanceIds));

      if (!queued?.length) return;

      for (const inst of queued) {
        if (manager.isRunning(inst.id)) continue;

        const { data: latest } = await bridgeSupabase
          .from("chat_messages")
          .select("role, content")
          .eq("instance_id", inst.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (latest?.[0]?.role === "user") {
          console.log(`[bridge-poll] Processing queued instance ${inst.id}`);
          manager.sendMessage(inst.id, latest[0].content).catch((err: any) => {
            console.error(`[bridge-poll] Failed for ${inst.id}:`, err);
          });
        }
      }
    } catch (err) {
      console.error("[bridge-poll] Error:", err);
    }
  }, 30_000);

  // --- Bridge heartbeat — update every 15s so the UI can detect if bridge is alive ---
  const heartbeatInterval = setInterval(async () => {
    try {
      await bridgeSupabase
        .from("bridge_status")
        .upsert({ id: "default", last_heartbeat_at: new Date().toISOString(), status: "online" });
    } catch {}
  }, 15_000);
  // Write initial heartbeat immediately
  try {
    await bridgeSupabase
      .from("discovered_repos")
      .upsert({ id: "default", last_heartbeat_at: new Date().toISOString(), status: "online" });
  } catch {}

  // --- Graceful shutdown ---
  async function shutdown(signal: string) {
    console.log(`\n[server] Received ${signal}, shutting down...`);
    clearInterval(pollInterval);
    clearInterval(heartbeatInterval);
    if (refreshTimer) clearTimeout(refreshTimer);
    await bridgeSupabase.removeAllChannels();
    await manager.shutdown();
    server.close(() => {
      console.log("[server] Server closed");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("[server] Forced exit");
      process.exit(1);
    }, 30_000).unref();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log("[bridge] Ready — listening for messages");
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.prepare().then(() => {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = parse(req.url || "/", true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(
      `[server] Claude Hub running on http://localhost:${port} (${dev ? "development" : "production"})`
    );

    // Scan repos, sync to Supabase, then start bridge
    (async () => {
      try {
        const repos = await scanRepos();
        console.log(`[repo-scanner] Found ${repos.length} local repos`);

        await syncReposToSupabase(repos);
        await initBridge(server, repos);
      } catch (err) {
        console.error("[startup] Fatal error:", err);
        process.exit(1);
      }
    })();
  });
});
