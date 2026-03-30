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
// Session scanner — syncs local IDE sessions to Supabase for phone access
// ---------------------------------------------------------------------------

interface LocalSession {
  id: string;
  repo_path: string;
  repo_name: string;
  preview: string;
  message_count: number;
  last_activity_at: string;
}

// Resolve a Claude project key (e.g. "-Users-agents-claude-hub") back to a real
// filesystem path ("/Users/agents/claude-hub"). The key replaces "/" with "-", but
// directory names can also contain dashes, so we walk the filesystem to disambiguate.
async function resolveProjectPath(projectDir: string): Promise<string> {
  const { existsSync } = await import("node:fs");

  // Strip leading "-" (represents root "/"), split on remaining dashes
  const parts = projectDir.slice(1).split("-"); // e.g. ["Users","agents","claude","hub"]

  let resolved = "/";
  let i = 0;

  while (i < parts.length) {
    // Try longest combination first (e.g. "orbital-deploy-1" before "orbital-deploy")
    // then fall back to shorter ones. This ensures "orbital-deploy-1" beats "orbital-deploy/1".
    let found = false;
    for (let j = parts.length - 1; j >= i; j--) {
      const combined = parts.slice(i, j + 1).join("-");
      const candidate = resolved === "/" ? `/${combined}` : `${resolved}/${combined}`;
      if (existsSync(candidate)) {
        resolved = candidate;
        i = j + 1;
        found = true;
        break;
      }
    }

    if (!found) {
      // Fallback: treat as separator (same as old behavior)
      const single = resolved === "/" ? `/${parts[i]}` : `${resolved}/${parts[i]}`;
      resolved = single;
      i++;
    }
  }

  return resolved;
}

async function scanLocalSessions(): Promise<LocalSession[]> {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");

  const projectsDir = join(homedir(), ".claude", "projects");
  const sessions: LocalSession[] = [];

  let projectDirs: string[] = [];
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    projectDirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith("-"))
      .map(e => e.name);
  } catch {
    return [];
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const projectDir of projectDirs) {
    const projectPath = join(projectsDir, projectDir);
    const repoPath = await resolveProjectPath(projectDir);
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

        // Skip old sessions
        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat || fileStat.mtimeMs < thirtyDaysAgo) continue;

        // Parse session file
        try {
          const content = await readFile(filePath, "utf-8");
          const lines = content.trim().split("\n").filter(Boolean);

          let firstUserMessage = "";
          let lastTimestamp = "";
          let userCount = 0;
          let assistantCount = 0;

          // Extract clean preview text, stripping IDE/system context tags
          function extractCleanPreview(text: string): string {
            // Strip XML-like tags and their content (e.g., <ide_selection>..., <system-reminder>...)
            let clean = text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "");
            // Strip any remaining self-closing or orphaned tags
            clean = clean.replace(/<[^>]*>/g, "");
            // Collapse whitespace
            clean = clean.replace(/\s+/g, " ").trim();
            return clean;
          }

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.timestamp) lastTimestamp = entry.timestamp;

              if (entry.type === "user") {
                userCount++;
                if (!firstUserMessage && entry.message?.content) {
                  const msgContent = entry.message.content;
                  let rawText = "";
                  if (typeof msgContent === "string") {
                    rawText = msgContent;
                  } else if (Array.isArray(msgContent)) {
                    const textBlock = msgContent.find((c: any) => c.type === "text");
                    if (textBlock?.text) rawText = textBlock.text;
                  }
                  const cleaned = extractCleanPreview(rawText);
                  if (cleaned.length > 0) {
                    firstUserMessage = cleaned.slice(0, 100);
                  }
                }
              } else if (entry.type === "assistant") {
                assistantCount++;
              }
            } catch {}
          }

          if (userCount === 0 && assistantCount === 0) continue;

          sessions.push({
            id: sessionId,
            repo_path: repoPath,
            repo_name: repoName,
            preview: firstUserMessage || "No preview",
            message_count: userCount + assistantCount,
            last_activity_at: lastTimestamp || new Date().toISOString(),
          });
        } catch {}
      }
    } catch {}
  }

  // Sort by last activity, limit to 100 most recent
  sessions.sort((a, b) =>
    new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
  );
  return sessions.slice(0, 100);
}

async function syncSessionsToSupabase(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  try {
    const sessions = await scanLocalSessions();
    const restBase = `${supabaseUrl}/rest/v1/local_sessions`;
    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };

    // Clear existing and insert new
    await fetch(`${restBase}?id=neq.`, { method: "DELETE", headers });

    if (sessions.length > 0) {
      const res = await fetch(restBase, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(sessions),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[session-scanner] Sync failed:", text);
      } else {
        console.log(`[session-scanner] Synced ${sessions.length} local sessions to Supabase`);
      }
    }
  } catch (err) {
    console.error("[session-scanner] Error:", err);
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

  // --- Sync local IDE sessions to Supabase on startup ---
  // This allows the Vercel API to read sessions without filesystem access
  syncSessionsToSupabase().then(() => {
    console.log("[bridge] Initial session sync complete");
  });

  // Periodically resync sessions every 5 minutes
  setInterval(() => {
    syncSessionsToSupabase().catch(err => {
      console.error("[bridge] Periodic session sync failed:", err);
    });
  }, 5 * 60 * 1000);

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

  // Helper to get the last assistant message for a completion summary
  async function getLastAssistantPreview(instanceId: string): Promise<string> {
    try {
      const { data } = await bridgeSupabase
        .from("chat_messages")
        .select("content")
        .eq("instance_id", instanceId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]?.content) {
        // Strip markdown, collapse whitespace, truncate
        const clean = data[0].content
          .replace(/```[\s\S]*?```/g, "[code]")
          .replace(/[#*_~`>]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        return clean.length > 120 ? clean.slice(0, 120) + "…" : clean;
      }
    } catch { /* best effort */ }
    return "Claude finished processing.";
  }

  // --- Push notification triggers ---
  // Fire when Claude finishes (idle), needs permission, or errors
  manager.on("status_change", async (instanceId: string, status: string, error?: string) => {
    const name = await getInstanceName(instanceId);
    if (status === "idle") {
      const preview = await getLastAssistantPreview(instanceId);
      sendPushNotification({
        title: `✓ ${name}`,
        body: preview,
        instanceId,
        tag: `idle-${instanceId}`,
      });
    } else if (status === "error") {
      sendPushNotification({
        title: `✗ ${name}`,
        body: error || "An error occurred.",
        instanceId,
        tag: `error-${instanceId}`,
      });
    }
  });

  manager.on("permission_request", async (instanceId: string, data: any) => {
    const name = await getInstanceName(instanceId);
    const toolDesc = data.toolName === "Bash"
      ? `Run command: ${(data.toolInput?.command || "").slice(0, 80)}`
      : data.toolName === "Edit" || data.toolName === "Write"
      ? `${data.toolName}: ${(data.toolInput?.file_path || "").split("/").pop()}`
      : `${data.toolName}`;
    sendPushNotification({
      title: `⏸ ${name} — needs approval`,
      body: toolDesc,
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
      const { id, status, current_session_id, repo_path } = payload.new;
      const oldSessionId = payload.old?.current_session_id;

      // If user set status to "idle" via the interrupt API, abort the running query
      if (status === "idle" && localInstanceIds.has(id) && manager.isRunningOrQueued(id)) {
        console.log(`[bridge] User interrupted instance ${id}, aborting...`);
        await manager.interrupt(id);
      }

      // Detect session import: session_id changed and instance is local.
      // CRITICAL: Skip if the instance is locked (bridge is actively processing it).
      // When the SDK returns a new session_id during sendMessage(), it updates current_session_id
      // in the DB, which triggers this handler. Without this guard, importSessionMessages() would
      // delete all messages and re-import from JSONL — including the user message that's being
      // processed — creating a duplicate that the bridge executes again.
      if (current_session_id && current_session_id !== oldSessionId && repo_path) {
        if (instanceLocks.has(id) || manager.isRunning(id)) {
          console.log(`[bridge] Skipping session import for ${id} — instance is actively processing`);
        } else {
          importSessionMessages(id, current_session_id, repo_path).catch(err => {
            console.error(`[bridge] Session import failed for ${id}:`, err);
          });
        }
      }
    })
    .subscribe();

  // --- Session import handler ---
  // When a phone user imports a desktop session, the API sets current_session_id
  // on the instance. The bridge detects this via Realtime and reads the local JSONL
  // file to populate chat_messages.
  async function importSessionMessages(instanceId: string, sessionId: string, repoPath: string) {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");

    const projectKey = repoPath.replace(/\//g, "-");
    const sessionPath = join(homedir(), ".claude", "projects", projectKey, `${sessionId}.jsonl`);

    console.log(`[bridge] Importing session ${sessionId.slice(0, 8)}... for instance ${instanceId.slice(0, 8)}...`);

    let content: string;
    try {
      content = await readFile(sessionPath, "utf-8");
    } catch {
      console.error(`[bridge] Session file not found: ${sessionPath}`);
      return;
    }

    const lines = content.trim().split("\n").filter(Boolean);
    const messagesToInsert: any[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "user" && entry.type !== "assistant") continue;

        let msgContent = "";
        const messageContent = entry.message?.content;
        if (typeof messageContent === "string") {
          msgContent = messageContent;
        } else if (Array.isArray(messageContent)) {
          const textParts = messageContent
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text);
          msgContent = textParts.join("\n");
        }
        if (!msgContent) continue;

        messagesToInsert.push({
          instance_id: instanceId,
          role: entry.type === "user" ? "user" : "assistant",
          content: msgContent,
          status: "done",
          created_at: entry.timestamp || new Date().toISOString(),
          tool_name: null,
          tool_id: null,
        });
      } catch {
        // Skip malformed lines
      }
    }

    if (messagesToInsert.length === 0) {
      console.log(`[bridge] No messages to import for session ${sessionId.slice(0, 8)}...`);
      return;
    }

    // Clear existing messages for this instance
    await bridgeSupabase
      .from("chat_messages")
      .delete()
      .eq("instance_id", instanceId);

    // Insert in batches (Supabase REST limit)
    // Use .select("id, role") to get back IDs so we can mark user messages as processed
    // (prevents the Realtime handler from picking them up as new messages)
    const BATCH = 500;
    for (let i = 0; i < messagesToInsert.length; i += BATCH) {
      const batch = messagesToInsert.slice(i, i + BATCH);
      const { data: inserted, error } = await bridgeSupabase
        .from("chat_messages")
        .insert(batch)
        .select("id, role");
      if (error) {
        console.error(`[bridge] Message insert error (batch ${i / BATCH}):`, error);
      }
      // Mark imported user messages as processed so Realtime handler skips them
      if (inserted) {
        for (const msg of inserted) {
          if (msg.role === "user" && msg.id) {
            processedMessageIds.set(msg.id, Date.now());
          }
        }
      }
    }

    // Update session sync count to match the imported JSONL state
    const jsonlCount = messagesToInsert.length;
    sessionMessageCounts.set(instanceId, jsonlCount);

    console.log(`[bridge] Imported ${messagesToInsert.length} messages for session ${sessionId.slice(0, 8)}...`);
  }

  // --- Live session sync: desktop IDE → phone ---
  // Polls active session JSONL files for new messages written by the desktop IDE/CLI
  // and appends them to chat_messages so the phone sees them in real time.
  // Uses append-only sync to avoid triggering the bridge's Realtime handler.
  const sessionFileMtimes = new Map<string, number>(); // instanceId → last known mtime
  const sessionMessageCounts = new Map<string, number>(); // instanceId → JSONL msg count at last sync

  async function syncActiveSessionFiles() {
    const { readFile, stat: fsStat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");

    if (localInstanceIds.size === 0) return;

    // Get all local instances with a current_session_id
    const { data: instances } = await bridgeSupabase
      .from("instances")
      .select("id, repo_path, current_session_id, status")
      .in("id", Array.from(localInstanceIds))
      .not("current_session_id", "is", null);

    if (!instances?.length) return;

    for (const inst of instances) {
      // Skip instances the bridge is actively processing (it writes its own messages)
      if (inst.status === "running" || inst.status === "queued") continue;

      const projectKey = inst.repo_path.replace(/\//g, "-");
      const sessionPath = join(homedir(), ".claude", "projects", projectKey, `${inst.current_session_id}.jsonl`);

      // Check mtime — skip if file hasn't changed
      const fileStat = await fsStat(sessionPath).catch(() => null);
      if (!fileStat) continue;

      const lastMtime = sessionFileMtimes.get(inst.id) || 0;
      if (fileStat.mtimeMs <= lastMtime) continue;

      sessionFileMtimes.set(inst.id, fileStat.mtimeMs);

      // Parse ALL messages from the JSONL
      let content: string;
      try {
        content = await readFile(sessionPath, "utf-8");
      } catch { continue; }

      const lines = content.trim().split("\n").filter(Boolean);
      const jsonlMessages: any[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== "user" && entry.type !== "assistant") continue;
          let msgContent = "";
          const mc = entry.message?.content;
          if (typeof mc === "string") msgContent = mc;
          else if (Array.isArray(mc)) {
            msgContent = mc.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
          }
          if (!msgContent) continue;
          jsonlMessages.push({
            role: entry.type === "user" ? "user" : "assistant",
            content: msgContent,
            created_at: entry.timestamp || new Date().toISOString(),
          });
        } catch { /* skip */ }
      }

      // Check how many messages we last synced for this session
      const lastSyncedCount = sessionMessageCounts.get(inst.id) || 0;

      if (jsonlMessages.length <= lastSyncedCount) continue; // No new messages

      // Only insert messages beyond what we last synced
      const newMessages = jsonlMessages.slice(lastSyncedCount);
      sessionMessageCounts.set(inst.id, jsonlMessages.length);

      console.log(`[session-sync] ${newMessages.length} new messages for ${inst.id.slice(0, 8)}... (${lastSyncedCount} → ${jsonlMessages.length})`);

      // Safety net: check DB for existing messages with same content to prevent duplicates.
      // This catches edge cases where the count-based deduplication fails (e.g., race conditions).
      const { data: existingMsgs } = await bridgeSupabase
        .from("chat_messages")
        .select("content, role")
        .eq("instance_id", inst.id);

      const existingSet = new Set(
        (existingMsgs || []).map((m: any) => `${m.role}:${m.content}`)
      );

      const toInsert = newMessages
        .filter(m => {
          const key = `${m.role}:${m.content}`;
          if (existingSet.has(key)) {
            console.log(`[session-sync] Skipping duplicate: ${m.role} "${m.content.slice(0, 30)}..."`);
            return false;
          }
          return true;
        })
        .map(m => ({
          instance_id: inst.id,
          role: m.role,
          content: m.content,
          status: "done",
          created_at: m.created_at,
          tool_name: null,
          tool_id: null,
        }));

      if (toInsert.length === 0) {
        console.log(`[session-sync] All messages already exist in DB, skipping insert`);
        continue;
      }

      // Acquire instance lock BEFORE inserting to prevent the Realtime handler
      // from racing: the INSERT triggers a Realtime event, but the handler checks
      // instanceLocks first. Without this lock, the Realtime event could arrive
      // before processedMessageIds is updated, causing double-processing.
      instanceLocks.add(inst.id);
      try {
        const BATCH = 500;
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const batch = toInsert.slice(i, i + BATCH);
          const { data: inserted, error } = await bridgeSupabase
            .from("chat_messages")
            .insert(batch)
            .select("id, role");
          if (error) {
            console.error(`[session-sync] Insert error:`, error);
          } else if (inserted) {
            // Mark inserted user messages as already-processed so the bridge's
            // Realtime handler doesn't try to execute them as new user queries
            for (const msg of inserted) {
              if (msg.role === "user") {
                processedMessageIds.set(msg.id, Date.now());
              }
            }
          }
        }
      } finally {
        instanceLocks.delete(inst.id);
      }
    }
  }

  // Count text messages in a JSONL session file (user + assistant only)
  async function countJsonlMessages(repoPath: string, sessionId: string): Promise<number> {
    const sessionPath = join(homedir(), ".claude", "projects",
      repoPath.replace(/\//g, "-"), `${sessionId}.jsonl`);
    try {
      const content = await readFile(sessionPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      let count = 0;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== "user" && entry.type !== "assistant") continue;
          const mc = entry.message?.content;
          let hasText = false;
          if (typeof mc === "string") hasText = !!mc;
          else if (Array.isArray(mc)) hasText = mc.some((c: any) => c.type === "text" && c.text);
          if (hasText) count++;
        } catch { /* skip */ }
      }
      return count;
    } catch {
      return 0;
    }
  }

  // Initialize message counts from JSONL files so we don't re-sync on startup.
  // Previously used DB row count, but that includes tool messages and diverges
  // from the JSONL text message count, causing false re-imports.
  async function initSessionSyncCounts() {
    if (localInstanceIds.size === 0) return;
    const { data: instances } = await bridgeSupabase
      .from("instances")
      .select("id, repo_path, current_session_id")
      .in("id", Array.from(localInstanceIds))
      .not("current_session_id", "is", null);
    if (!instances?.length) return;

    for (const inst of instances) {
      const count = await countJsonlMessages(inst.repo_path, inst.current_session_id);
      if (count > 0) {
        sessionMessageCounts.set(inst.id, count);
        console.log(`[session-sync] Init count for ${inst.id.slice(0, 8)}...: ${count} JSONL messages`);
      }
    }
  }

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

  // --- Remote restart listener ---
  // When the phone UI requests a restart, it sets restart_requested_at in bridge_status.
  // The bridge sees this via Realtime and exits gracefully. The wrapper script (bridge.sh)
  // will restart it automatically.
  bridgeSupabase
    .channel("bridge-restart")
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "bridge_status",
    }, async (payload: any) => {
      const requestedAt = payload.new?.restart_requested_at;
      if (!requestedAt) return;
      // Only act on recent requests (within last 30 seconds)
      const age = Date.now() - new Date(requestedAt).getTime();
      if (age > 30_000) return;
      console.log("[bridge] Restart requested remotely — shutting down for restart...");
      // Clear the flag so we don't restart-loop
      await bridgeSupabase
        .from("bridge_status")
        .update({ restart_requested_at: null })
        .eq("id", "default");
      // Exit with code 0 — wrapper script will restart us
      shutdown("REMOTE_RESTART");
    })
    .subscribe();

  // Clear any stale restart request on startup
  await bridgeSupabase
    .from("bridge_status")
    .update({ restart_requested_at: null })
    .eq("id", "default");

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

  // --- Deduplication: track processed message IDs and per-instance locks ---
  // Supabase Realtime has at-least-once delivery, so duplicate events are possible.
  // We track processed message IDs to avoid re-processing the same user message.
  // Track processed message IDs with timestamps for time-based eviction.
  // Using a Map (id → timestamp) instead of Set so we can evict entries
  // older than 10 minutes without losing recent dedup protection.
  const processedMessageIds = new Map<string, number>();
  const instanceLocks = new Set<string>(); // Synchronous lock before any async work

  // Evict entries older than 10 minutes (not a full clear, which caused dedup gaps)
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [id, ts] of processedMessageIds) {
      if (ts < cutoff) processedMessageIds.delete(id);
    }
  }, 60_000); // Check every minute

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
        const { id: messageId, instance_id: instanceId, content } = payload.new;
        if (!instanceId || !content) return;

        // Deduplicate: skip if we've already processed this exact message
        if (messageId && processedMessageIds.has(messageId)) {
          console.log(`[bridge] Skipping duplicate Realtime event for message ${messageId}`);
          return;
        }
        if (messageId) processedMessageIds.set(messageId, Date.now());

        // Only process local instances — check cache first, then DB fallback
        if (!localInstanceIds.has(instanceId)) {
          // Cache miss — check DB directly (handles race with newly created instances)
          const inst = await manager.getInstance(instanceId);
          if (!inst || !localRepoPaths.has(inst.repo_path)) return;
          // Update cache
          localInstanceIds.add(instanceId);
        }

        // Synchronous lock: prevent concurrent async processing for the same instance.
        // This closes the race window between isRunning() check and activeQueries.set()
        // inside sendMessage(), where duplicate Realtime events could both slip through.
        if (instanceLocks.has(instanceId)) {
          console.log(`[bridge] Instance ${instanceId} locked, marking queued for poll pickup`);
          await bridgeSupabase
            .from("instances")
            .update({ status: "queued", updated_at: new Date().toISOString() })
            .eq("id", instanceId);
          return;
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

        // Acquire synchronous lock BEFORE any async work
        instanceLocks.add(instanceId);

        console.log(`[bridge] Executing message for instance ${instanceId} (msg: ${messageId})`);
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
        } finally {
          // Update session sync count BEFORE releasing lock to prevent race condition:
          // If we release the lock first, session sync could run before the count is updated
          // and re-insert messages that the bridge just wrote to the JSONL file.
          try {
            const inst = await manager.getInstance(instanceId);
            if (inst?.current_session_id) {
              const jsonlCount = await countJsonlMessages(inst.repo_path, inst.current_session_id);
              sessionMessageCounts.set(instanceId, jsonlCount);
            }
          } catch { /* best effort */ }

          instanceLocks.delete(instanceId);
        }

        // No re-check block here — the 30s poll fallback handles the case where
        // a new user message arrives while the bridge is processing. The previous
        // re-check caused duplicate processing: it called sendMessage() without
        // holding instanceLocks, racing with Realtime events for the same message.
      }
    )
    .subscribe((status: string) => {
      console.log(`[bridge] Realtime subscription: ${status}`);
    });

  // --- Start live session sync (desktop IDE → phone) ---
  // Initialize counts from DB so we don't re-import existing messages on startup
  initSessionSyncCounts().then(() => {
    console.log("[session-sync] Initialized message counts, starting 10s poll");
  });
  setInterval(() => {
    syncActiveSessionFiles().catch(err => {
      console.error("[session-sync] Error:", err);
    });
  }, 10_000);

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

        // Fetch last 2 messages to check if latest user message already has a response
        const { data: latest } = await bridgeSupabase
          .from("chat_messages")
          .select("id, role, content")
          .eq("instance_id", inst.id)
          .order("created_at", { ascending: false })
          .limit(2);

        if (latest?.[0]?.role === "user") {
          // Skip if this message was already processed by Realtime handler
          if (latest[0].id && processedMessageIds.has(latest[0].id)) {
            console.log(`[bridge-poll] Message ${latest[0].id} already processed, resetting instance ${inst.id} to idle`);
            await bridgeSupabase
              .from("instances")
              .update({ status: "idle", updated_at: new Date().toISOString() })
              .eq("id", inst.id);
            continue;
          }
          // Skip if the instance is locked (Realtime handler is processing)
          if (instanceLocks.has(inst.id)) {
            console.log(`[bridge-poll] Instance ${inst.id} locked by Realtime handler, skipping`);
            continue;
          }
          if (latest[0].id) processedMessageIds.set(latest[0].id, Date.now());
          console.log(`[bridge-poll] Processing queued instance ${inst.id} (msg: ${latest[0].id})`);
          manager.sendMessage(inst.id, latest[0].content)
            .then(async () => {
              // Update session sync count to prevent re-import of JSONL entries
              try {
                const instData = await manager.getInstance(inst.id);
                if (instData?.current_session_id) {
                  const jsonlCount = await countJsonlMessages(instData.repo_path, instData.current_session_id);
                  sessionMessageCounts.set(inst.id, jsonlCount);
                }
              } catch { /* best effort */ }
            })
            .catch((err: any) => {
              console.error(`[bridge-poll] Failed for ${inst.id}:`, err);
            });
        } else {
          // Latest message is assistant/tool — instance is stuck "queued" after
          // the bridge already processed it (e.g., API route set "queued" after
          // the bridge finished). Reset to idle.
          console.log(`[bridge-poll] Instance ${inst.id} is queued but latest message is ${latest?.[0]?.role ?? "empty"}, resetting to idle`);
          await bridgeSupabase
            .from("instances")
            .update({ status: "idle", updated_at: new Date().toISOString() })
            .eq("id", inst.id);
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
