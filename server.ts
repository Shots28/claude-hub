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
import { readdir, access, readFile, stat, realpath } from "node:fs/promises";
import { join, resolve as pathResolve } from "node:path";
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

        // Check if it's a git repo
        let isGitRepo = false;
        try {
          await access(join(fullPath, ".git"));
          isGitRepo = true;
        } catch {}

        folders.push({ name: e.name, path: fullPath, is_git_repo: isGitRepo });
      }
    } catch {}
  }

  // Sort: git repos first, then alphabetically within each group
  folders.sort((a, b) => {
    if (a.is_git_repo !== b.is_git_repo) return a.is_git_repo ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return folders;
}

async function syncFoldersToSupabase(folders: { name: string; path: string; is_git_repo: boolean }[]): Promise<void> {
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

  if (folders.length > 0) {
    const res = await fetch(restBase, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(folders),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[folder-scanner] Sync failed:", text);
    } else {
      const gitCount = folders.filter(f => f.is_git_repo).length;
      console.log(`[folder-scanner] Synced ${folders.length} folders (${gitCount} git repos) to Supabase`);
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge — connects Supabase Realtime to local Claude Code execution
// ---------------------------------------------------------------------------

async function initBridge(
  server: ReturnType<typeof createServer>,
  folders: { name: string; path: string; is_git_repo: boolean }[]
) {
  // --- Env validation ---
  const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET"];

  // Validate optional numeric env vars
  const numericEnvVars = {
    MAX_CONCURRENT_QUERIES: { default: 3, min: 1, max: 20 },
    IDLE_TIMEOUT_MINUTES: { default: 30, min: 1, max: 1440 },
    SHUTDOWN_TIMEOUT_MS: { default: 30000, min: 5000, max: 300000 },
    STREAMING_DEBOUNCE_CHARS: { default: 500, min: 50, max: 5000 },
  };
  for (const [key, { min, max }] of Object.entries(numericEnvVars)) {
    const val = process.env[key];
    if (val !== undefined) {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < min || num > max) {
        console.error(`[bridge] Invalid ${key}=${val} (must be ${min}-${max}), using default`);
        delete process.env[key]; // Fall back to default
      }
    }
  }
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
  console.log(`[bridge] Connecting to Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(-30)}`);
  const bridgeSupabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );

  // --- Push notification helper ---
  // Sends a push notification via the Next.js API route.
  // Non-blocking: errors are logged but never throw.
  const APP_URL = process.env.APP_URL; // e.g. https://claude-hub.vercel.app or http://localhost:3100
  const PUSH_API_SECRET = process.env.PUSH_API_SECRET;

  async function sendPushNotification(payload: {
    title: string;
    body: string;
    instanceId?: string;
    tag?: string;
  }): Promise<void> {
    if (!APP_URL || !PUSH_API_SECRET) return;
    try {
      await fetch(`${APP_URL}/api/push/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PUSH_API_SECRET}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[bridge] Push notification failed:", (err as Error).message);
    }
  }

  // Helper to get instance name for push notifications
  async function getInstanceName(instanceId: string): Promise<string> {
    try {
      const { data } = await bridgeSupabase
        .from("instances")
        .select("name")
        .eq("id", instanceId)
        .single();
      return data?.name || instanceId.slice(0, 8);
    } catch {
      return instanceId.slice(0, 8);
    }
  }

  // --- Push notification triggers ---
  // Fire when Claude finishes (idle), needs permission, or errors
  manager.on("status_change", async (instanceId: string, status: string, error?: string) => {
    const name = await getInstanceName(instanceId);
    if (status === "idle") {
      sendPushNotification({
        title: `${name} completed`,
        body: "Claude finished processing.",
        instanceId,
        tag: `idle-${instanceId}`,
      });
    } else if (status === "error") {
      sendPushNotification({
        title: `${name} error`,
        body: error || "An error occurred.",
        instanceId,
        tag: `error-${instanceId}`,
      });
    }
  });

  manager.on("permission_request", async (instanceId: string, data: any) => {
    const name = await getInstanceName(instanceId);
    sendPushNotification({
      title: `${name} needs approval`,
      body: `Permission requested: ${data.toolName}`,
      instanceId,
      tag: `perm-${data.id}`,
    });
  });

  // --- Build local instance ownership cache ---
  // localRepoPaths is refreshed when discovered_repos changes (e.g., user triggers a rescan)
  let localRepoPaths = new Set(folders.map((f) => f.path));
  const localInstanceIds = new Set<string>();

  let refreshTimer: NodeJS.Timeout | null = null;

  // Refresh localRepoPaths from the discovered_repos table
  async function refreshLocalRepoPaths() {
    try {
      const { data: repos } = await bridgeSupabase
        .from("discovered_repos")
        .select("path");
      if (repos) {
        const newPaths = new Set<string>(repos.map((r: { path: string }) => r.path));
        const added = [...newPaths].filter(p => !localRepoPaths.has(p));
        if (added.length > 0) {
          console.log(`[bridge] Discovered ${added.length} new repo paths`);
        }
        localRepoPaths = newPaths;
      }
    } catch (err) {
      console.error("[bridge] Failed to refresh repo paths:", err);
    }
  }

  async function refreshLocalInstanceCache() {
    // Also refresh repo paths to pick up any newly discovered repos
    await refreshLocalRepoPaths();

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
  // Also listen for status changes to handle user-initiated interrupts
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
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "instances",
    }, async (payload: any) => {
      const { id, status } = payload.new;
      // If user set status to "idle" via the interrupt API, abort the running query
      if (status === "idle" && localInstanceIds.has(id) && manager.isRunningOrQueued(id)) {
        console.log(`[bridge] User interrupted instance ${id}, aborting...`);
        await manager.interrupt(id);
      }
    })
    .subscribe();

  // Refresh local repo paths when discovered_repos changes (e.g., user triggers rescan)
  bridgeSupabase
    .channel("bridge-discovered-repos")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "discovered_repos",
    }, () => {
      console.log("[bridge] discovered_repos changed, refreshing cache...");
      debouncedRefresh();
    })
    .subscribe();

  // --- Reset stale "running" and "queued" instances (scoped to local repos) ---
  if (localInstanceIds.size > 0) {
    const { data: staleRunning } = await bridgeSupabase
      .from("instances")
      .select("id")
      .eq("status", "running")
      .in("id", Array.from(localInstanceIds));

    if (staleRunning?.length) {
      await bridgeSupabase
        .from("instances")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .in("id", staleRunning.map((s: any) => s.id));
      console.log(`[bridge] Reset ${staleRunning.length} stale running instances to queued`);
    }

    // Reset stale "queued" instances that were left by a crashed bridge.
    // The poll loop will re-queue them if there's actually a pending user message.
    const { data: staleQueued } = await bridgeSupabase
      .from("instances")
      .select("id")
      .eq("status", "queued")
      .in("id", Array.from(localInstanceIds));

    if (staleQueued?.length) {
      await bridgeSupabase
        .from("instances")
        .update({ status: "idle", updated_at: new Date().toISOString() })
        .in("id", staleQueued.map((s: any) => s.id));
      console.log(`[bridge] Reset ${staleQueued.length} stale queued instances to idle`);
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

        // Skip if already running — mark as queued so the poll picks it up
        if (manager.isRunning(instanceId)) {
          console.log(`[bridge] Instance ${instanceId} busy, marking queued for poll pickup`);
          await bridgeSupabase
            .from("instances")
            .update({ status: "queued", updated_at: new Date().toISOString() })
            .eq("id", instanceId);
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

        // After completion, re-check for newer unprocessed user messages
        try {
          const { data: latest } = await bridgeSupabase
            .from("chat_messages")
            .select("role, content")
            .eq("instance_id", instanceId)
            .order("created_at", { ascending: false })
            .limit(1);

          if (latest?.[0]?.role === "user" && !manager.isRunning(instanceId)) {
            console.log(`[bridge] Re-processing pending message for instance ${instanceId}`);
            manager.sendMessage(instanceId, latest[0].content).catch((err: any) => {
              console.error(`[bridge] Re-process failed for ${instanceId}:`, err);
            });
          }
        } catch (err) {
          console.error(`[bridge] Re-check failed for ${instanceId}:`, err);
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
  //
  // Message ordering: if multiple user messages arrive while busy (msg1, msg2, msg3),
  // the poll processes the LATEST (msg3). This is correct because Claude Code uses
  // session resume — it sees the full conversation history including all prior messages.
  // Processing each message separately would generate 3 independent responses, which
  // is not the intended UX for a conversational AI.
  //
  // All user messages have status='done' (set by the API route on insertion).
  // They're visible in the chat UI and included in Claude's session history.
  // No messages are lost or need a "superseded" status.
  const pollInterval = setInterval(async () => {
    try {
      // Refresh instance cache on every poll to catch newly created instances
      // (Realtime subscription for INSERT events is unreliable)
      await refreshLocalInstanceCache();

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

  // --- Bridge heartbeat — update every 10s so the UI can detect if bridge is alive ---
  // Uses direct REST API instead of Supabase JS client to avoid PostgREST schema cache issues
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  console.log(`[bridge] Heartbeat target: ${supabaseUrl?.slice(-30)} (key length: ${supabaseKey?.length})`);

  // Use Node.js https module directly to avoid Next.js fetch patching
  const https = await import("node:https");

  async function writeHeartbeat(status: "online" | "offline") {
    return new Promise<void>((resolve) => {
      const payload = JSON.stringify({
        id: "default",
        last_heartbeat_at: new Date().toISOString(),
        status,
      });
      const url = new URL(`${supabaseUrl}/rest/v1/bridge_status`);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (c: Buffer) => (body += c));
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 400) {
              console.error(`[bridge] Heartbeat write failed (${res.statusCode}):`, body);
            }
            resolve();
          });
        },
      );
      req.on("error", (err) => {
        console.error("[bridge] Heartbeat write failed:", err.message);
        resolve();
      });
      req.write(payload);
      req.end();
    });
  }

  const heartbeatInterval = setInterval(() => writeHeartbeat("online"), 10_000);
  // Write initial heartbeat immediately
  await writeHeartbeat("online");
  console.log("[bridge] Heartbeat started (10s interval)");

  // --- File request handler: read files on behalf of the frontend ---
  const FILE_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB

  async function handleFileRequest(requestRow: any) {
    const { id, instance_id, file_path: rawFilePath } = requestRow;
    try {
      // Look up the instance to get repo_path
      const { data: inst } = await bridgeSupabase
        .from("instances")
        .select("repo_path")
        .eq("id", instance_id)
        .maybeSingle();

      if (!inst?.repo_path) {
        await bridgeSupabase
          .from("file_requests")
          .update({ status: "error", error_message: "Instance not found", completed_at: new Date().toISOString() })
          .eq("id", id);
        return;
      }

      const repoPath = pathResolve(inst.repo_path);
      let resolvedRepoPath: string;
      try { resolvedRepoPath = await realpath(repoPath); } catch { resolvedRepoPath = repoPath; }

      // CRITICAL: Strip leading slashes before resolving to prevent path.resolve
      // from treating the file path as absolute (bypassing containment check).
      const sanitized = rawFilePath.replace(/^\/+/, "");
      let resolved = pathResolve(repoPath, sanitized);
      let isGlobalClaudePath = false;

      // Special case: .claude/plans/ files may be in the global ~/.claude/plans/ directory
      // Claude CLI often writes plans there instead of in the repo
      if (sanitized.startsWith(".claude/plans/")) {
        try {
          await realpath(resolved); // Check if exists in repo
        } catch {
          // Not in repo, try global ~/.claude/plans/
          const homeDir = process.env.HOME || "/Users/agents";
          const globalPath = pathResolve(homeDir, sanitized);
          try {
            await realpath(globalPath);
            resolved = globalPath;
            isGlobalClaudePath = true;
            console.log(`[bridge] File request ${id}: Found plan in global ~/.claude/plans/`);
          } catch {
            // File doesn't exist in either location
          }
        }
      }

      // Containment check: resolved path must be inside repoPath OR be a global .claude path
      if (!isGlobalClaudePath && !resolved.startsWith(resolvedRepoPath + "/") && resolved !== resolvedRepoPath) {
        await bridgeSupabase
          .from("file_requests")
          .update({ status: "error", error_message: "Path traversal blocked", completed_at: new Date().toISOString() })
          .eq("id", id);
        return;
      }

      // Resolve symlinks and re-check containment
      let realPath: string;
      try {
        realPath = await realpath(resolved);
      } catch {
        await bridgeSupabase
          .from("file_requests")
          .update({ status: "error", error_message: "File not found", completed_at: new Date().toISOString() })
          .eq("id", id);
        return;
      }

      // Skip containment check for global .claude paths (they're not in the repo)
      if (!isGlobalClaudePath && !realPath.startsWith(resolvedRepoPath + "/") && realPath !== resolvedRepoPath) {
        await bridgeSupabase
          .from("file_requests")
          .update({ status: "error", error_message: "Symlink outside repository", completed_at: new Date().toISOString() })
          .eq("id", id);
        return;
      }

      // Check file size
      const fileStat = await stat(realPath);
      if (!fileStat.isFile()) {
        await bridgeSupabase
          .from("file_requests")
          .update({ status: "error", error_message: "Not a regular file", completed_at: new Date().toISOString() })
          .eq("id", id);
        return;
      }

      if (fileStat.size > FILE_SIZE_LIMIT) {
        await bridgeSupabase
          .from("file_requests")
          .update({ status: "error", error_message: `File too large (${(fileStat.size / 1024 / 1024).toFixed(1)}MB > 1MB limit)`, completed_at: new Date().toISOString() })
          .eq("id", id);
        return;
      }

      // Read file content
      const buffer = await readFile(realPath);

      // Binary check: look for null bytes in first 8KB
      const checkBytes = buffer.subarray(0, 8192);
      if (checkBytes.includes(0)) {
        await bridgeSupabase
          .from("file_requests")
          .update({ status: "error", error_message: "Binary file not supported", completed_at: new Date().toISOString() })
          .eq("id", id);
        return;
      }

      const content = buffer.toString("utf-8");

      await bridgeSupabase
        .from("file_requests")
        .update({ status: "completed", content, completed_at: new Date().toISOString() })
        .eq("id", id);

      console.log(`[bridge] File request ${id}: served ${realPath} (${fileStat.size} bytes)`);
    } catch (err) {
      console.error(`[bridge] File request ${id} error:`, err);
      await bridgeSupabase
        .from("file_requests")
        .update({ status: "error", error_message: (err as Error).message, completed_at: new Date().toISOString() })
        .eq("id", id);
    }
  }

  // Subscribe to new file requests
  bridgeSupabase
    .channel("bridge-file-requests")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "file_requests",
        filter: "status=eq.pending",
      },
      async (payload: any) => {
        const row = payload.new;
        if (!row?.id || row.status !== "pending") return;
        // Only handle requests for local instances
        if (!localInstanceIds.has(row.instance_id)) return;
        await handleFileRequest(row);
      }
    )
    .subscribe((status: string) => {
      console.log(`[bridge] File requests subscription: ${status}`);
    });

  // --- File request cleanup: delete completed requests older than 1 hour ---
  async function cleanupFileRequests() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await bridgeSupabase
        .from("file_requests")
        .delete()
        .lt("completed_at", oneHourAgo)
        .not("completed_at", "is", null)
        .select("id");
      if (data?.length) {
        console.log(`[bridge] Cleaned up ${data.length} old file requests`);
      }
    } catch (err) {
      console.error("[bridge] File request cleanup error:", err);
    }
  }

  // Run cleanup on startup and every 30 minutes
  await cleanupFileRequests();
  const fileCleanupInterval = setInterval(cleanupFileRequests, 30 * 60 * 1000);

  // Also process any pending file requests on startup (in case bridge was restarted)
  try {
    if (localInstanceIds.size > 0) {
      const { data: pendingRequests } = await bridgeSupabase
        .from("file_requests")
        .select("*")
        .eq("status", "pending")
        .in("instance_id", Array.from(localInstanceIds));
      if (pendingRequests?.length) {
        console.log(`[bridge] Processing ${pendingRequests.length} pending file requests from before restart`);
        for (const req of pendingRequests) {
          await handleFileRequest(req);
        }
      }
    }
  } catch (err) {
    console.error("[bridge] Startup file request sweep error:", err);
  }

  // --- Graceful shutdown ---
  async function shutdown(signal: string) {
    console.log(`\n[server] Received ${signal}, shutting down...`);
    clearInterval(pollInterval);
    clearInterval(heartbeatInterval);
    clearInterval(fileCleanupInterval);
    if (refreshTimer) clearTimeout(refreshTimer);

    // Mark bridge as offline immediately so UI reflects shutdown
    try {
      await writeHeartbeat("offline");
    } catch (err) {
      console.error("[bridge] Shutdown status write failed:", (err as Error).message);
    }

    await bridgeSupabase.removeAllChannels();
    await manager.shutdown();
    server.close(() => {
      console.log("[server] Server closed");
      process.exit(0);
    });
    const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || "30000", 10);
    setTimeout(() => {
      console.error("[server] Forced exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT).unref();
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

    // Scan folders, sync to Supabase, then start bridge
    (async () => {
      try {
        const folders = await scanFolders();
        console.log(`[folder-scanner] Found ${folders.length} local folders`);

        await syncFoldersToSupabase(folders);
        await initBridge(server, folders);
      } catch (err) {
        console.error("[startup] Fatal error:", err);
        process.exit(1);
      }
    })();
  });
});
