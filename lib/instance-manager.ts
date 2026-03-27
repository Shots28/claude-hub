import { EventEmitter } from "events";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type {
  InstanceStatus,
  ServerMessage,
  InstanceState,
  ToolInput,
  DbInstance,
  DbPermissionRequest,
} from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Async semaphore for concurrency limiting
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    this.permits = maxConcurrency;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      next();
    } else {
      this.permits++;
    }
  }

  get queueLength(): number {
    return this.waiting.length;
  }

  get activeCount(): number {
    return (
      (parseInt(process.env.MAX_CONCURRENT_QUERIES || "3") - this.permits) +
      this.waiting.length
    );
  }
}

interface PendingPermission {
  resolve: (approved: boolean) => void;
  timeoutId: NodeJS.Timeout;
}

export class InstanceManager extends EventEmitter {
  private supabase = createClient(supabaseUrl, supabaseServiceKey);
  private activeQueries = new Map<string, AbortController>();
  private queuedInstances = new Set<string>(); // Track instances waiting for semaphore
  private interruptedInstances = new Set<string>(); // Track interrupted instances
  private semaphore: Semaphore;
  private pendingPermissions = new Map<string, PendingPermission>();
  private idleTimers = new Map<string, NodeJS.Timeout>();
  private idleTimeoutMs: number;

  constructor() {
    super();
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_QUERIES || "3");
    this.semaphore = new Semaphore(maxConcurrent);
    this.idleTimeoutMs =
      parseInt(process.env.IDLE_TIMEOUT_MINUTES || "30") * 60 * 1000;

    // Prevent unhandled error events from crashing the process
    this.on("error", (instanceId: string, data: any) => {
      console.error(`[InstanceManager] Error event for ${instanceId}:`, data?.message || data);
    });
  }

  async getInstances(): Promise<DbInstance[]> {
    const { data, error } = await this.supabase
      .from("instances")
      .select("*")
      .order("sort_order")
      .order("created_at");

    if (error) throw error;
    return data || [];
  }

  async getInstance(id: string): Promise<DbInstance | null> {
    const { data, error } = await this.supabase
      .from("instances")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data;
  }

  async createInstance(params: {
    id: string;
    name: string;
    repoPath: string;
    permissionMode?: string;
    allowedTools?: string;
  }): Promise<DbInstance> {
    const { data, error } = await this.supabase
      .from("instances")
      .insert({
        id: params.id,
        name: params.name,
        repo_path: params.repoPath,
        permission_mode: params.permissionMode || "default",
        allowed_tools: params.allowedTools || "[]",
        status: "stopped",
      })
      .select()
      .single();

    if (error) throw error;
    this.emit("instance_created", data);
    return data;
  }

  async updateInstance(
    id: string,
    updates: Partial<DbInstance>
  ): Promise<DbInstance> {
    const { data, error } = await this.supabase
      .from("instances")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteInstance(id: string): Promise<void> {
    // Interrupt if running
    if (this.activeQueries.has(id)) {
      await this.interrupt(id);
    }

    // Clean up any pending permissions for this instance
    for (const [reqId, pending] of this.pendingPermissions) {
      // Check if this permission belongs to this instance by querying DB
      // For simplicity, resolve all — the instance is being deleted
      clearTimeout(pending.timeoutId);
      pending.resolve(false);
      this.pendingPermissions.delete(reqId);
    }

    // Clear idle timer
    const idleTimer = this.idleTimers.get(id);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(id);
    }

    const { error } = await this.supabase
      .from("instances")
      .delete()
      .eq("id", id);

    if (error) throw error;
    this.emit("instance_deleted", id);
  }

  async updateStatus(id: string, status: InstanceStatus, error?: string) {
    await this.supabase
      .from("instances")
      .update({
        status,
        error_message: error || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    this.emit("status_change", id, status, error);
  }

  // Parse attachments from the message content
  private parseAttachments(message: string): {
    text: string;
    attachments: Array<{ type: string; media_type?: string; data?: string; name: string; content?: string }>;
  } {
    const attachmentMatch = message.match(/<!-- ATTACHMENTS_JSON:(.+?):END_ATTACHMENTS -->/s);
    if (!attachmentMatch) {
      return { text: message, attachments: [] };
    }

    try {
      const attachments = JSON.parse(attachmentMatch[1]);
      const text = message.replace(/\n\n<!-- ATTACHMENTS_JSON:.+?:END_ATTACHMENTS -->/s, "").trim();
      return { text, attachments };
    } catch {
      console.warn("[InstanceManager] Failed to parse attachments JSON");
      return { text: message, attachments: [] };
    }
  }

  async sendMessage(instanceId: string, message: string): Promise<void> {
    // Check if instance already has active query
    if (this.activeQueries.has(instanceId)) {
      console.log(`[InstanceManager] Instance ${instanceId} busy — message queued for poll pickup`);
      return;
    }

    const instance = await this.getInstance(instanceId);
    if (!instance) {
      this.emit("error", instanceId, {
        code: "not_found",
        message: "Instance not found",
        retryable: false,
      });
      return;
    }

    // Parse any attachments from the message
    const { text: textContent, attachments } = this.parseAttachments(message);

    // Check concurrency - queue if needed
    const queuePos = this.semaphore.queueLength;
    if (queuePos > 0) {
      this.queuedInstances.add(instanceId);
      await this.updateStatus(instanceId, "queued");
      this.emit("queue_position", instanceId, queuePos);
    }

    await this.semaphore.acquire();

    // Check if interrupted while waiting in queue
    this.queuedInstances.delete(instanceId);
    if (this.interruptedInstances.has(instanceId)) {
      this.interruptedInstances.delete(instanceId);
      this.semaphore.release();
      console.log(`[InstanceManager] Instance ${instanceId} was interrupted while queued, aborting`);
      await this.updateStatus(instanceId, "idle");
      return;
    }

    // Clear any idle timer
    const idleTimer = this.idleTimers.get(instanceId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(instanceId);
    }

    const controller = new AbortController();
    this.activeQueries.set(instanceId, controller);
    await this.updateStatus(instanceId, "running");

    // User message already inserted by the API route — just create assistant placeholder
    // Create assistant message placeholder
    const { data: assistantMsg } = await this.supabase
      .from("chat_messages")
      .insert({
        instance_id: instanceId,
        role: "assistant",
        content: "",
        status: "streaming",
      })
      .select()
      .single();

    const assistantMsgId = assistantMsg?.id;
    let fullText = "";
    let currentMsgId = assistantMsgId;
    let turnText = "";

    let errorOccurred = false;
    try {
      // Dynamic import for the SDK (may not be available in all environments)
      let query: any;
      try {
        const sdk = await import("@anthropic-ai/claude-agent-sdk");
        query = sdk.query;
      } catch {
        // SDK not available — simulate for development
        console.warn(
          "[InstanceManager] Claude Agent SDK not available, using mock mode"
        );
        await this.mockQuery(instanceId, message, assistantMsgId);
        return;
      }

      const rawTools = instance.allowed_tools;
      const allowedTools: string[] = Array.isArray(rawTools)
        ? rawTools
        : typeof rawTools === "string"
        ? JSON.parse(rawTools || "[]")
        : [];

      // MCP server path is configurable via env var; skip if path doesn't exist
      const mcpPath = process.env.MCP_PLAN_REVIEW_PATH || "/Users/agents/tools/plan-review-mcp";
      let mcpServers: Record<string, any> | undefined;
      if (existsSync(mcpPath)) {
        mcpServers = {
          "plan-review": {
            type: "stdio",
            command: "npx",
            args: ["tsx", `${mcpPath}/src/index.ts`],
          },
        };
      } else {
        console.warn(`[InstanceManager] MCP plan-review path not found: ${mcpPath} — skipping MCP config`);
      }

      const queryOptions: any = {
        cwd: instance.repo_path,
        includePartialMessages: true,
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        permissionMode: ["bypassPermissions", "acceptEdits", "plan", "default"].includes(instance.permission_mode)
          ? instance.permission_mode
          : instance.permission_mode === "auto" ? "bypassPermissions"
          : "default",
        abortSignal: controller.signal,
        ...(mcpServers ? { mcpServers } : {}),
      };

      if (instance.model) {
        queryOptions.model = instance.model;
      }
      if (instance.max_thinking_tokens > 0) {
        queryOptions.maxThinkingTokens = instance.max_thinking_tokens;
      }

      // Permission callback
      if (instance.permission_mode === "default") {
        queryOptions.canUseTool = async (
          toolName: string,
          toolInput: unknown
        ): Promise<any> => {
          return this.handlePermissionRequest(
            instanceId,
            toolName,
            toolInput as ToolInput
          );
        };
      }

      // Build the prompt - can be a string or array of content blocks for multimodal
      let prompt: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }>;

      if (attachments.length > 0) {
        // Build multimodal prompt with images and text
        const contentBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

        // Add images first
        for (const att of attachments) {
          if (att.type === "image" && att.media_type && att.data) {
            contentBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: att.media_type,
                data: att.data,
              },
            });
          } else if (att.type === "file" && att.content) {
            // Include file content as text
            const fileText = `\n\n<file name="${att.name}">\n${att.content}\n</file>`;
            contentBlocks.push({ type: "text", text: fileText });
          }
        }

        // Add the user's text message
        if (textContent) {
          contentBlocks.push({ type: "text", text: textContent });
        }

        prompt = contentBlocks.length > 0 ? contentBlocks : textContent || "";
        console.log(`[InstanceManager] Sending multimodal message with ${attachments.filter(a => a.type === "image").length} images`);
      } else {
        prompt = textContent;
      }

      // Try to resume session; if it fails, retry without resume
      let queryIterable: AsyncIterable<any>;
      if (instance.current_session_id) {
        try {
          const resumeOpts = { ...queryOptions, resume: instance.current_session_id };
          queryIterable = query({ prompt, options: resumeOpts });
          // Test if the iterable works by getting the first event
          const iter = queryIterable[Symbol.asyncIterator]();
          const first = await iter.next();
          // Wrap remaining iteration
          queryIterable = (async function* () {
            if (!first.done) yield first.value;
            while (true) {
              const next = await iter.next();
              if (next.done) break;
              yield next.value;
            }
          })();
        } catch {
          // Catches ALL errors from resume (any non-zero exit code, network failures, etc.)
          console.log(`[InstanceManager] Resume failed for ${instanceId}, starting fresh`);
          await this.supabase
            .from("instances")
            .update({ current_session_id: null })
            .eq("id", instanceId);
          queryIterable = query({ prompt, options: queryOptions });
        }
      } else {
        queryIterable = query({ prompt, options: queryOptions });
      }

      for await (const event of queryIterable) {
        if (controller.signal.aborted) break;

        // Handle different event types
        if (event.type === "stream_event") {
          const streamEvent = event.event;

          if (streamEvent?.type === "message_start") {
            // New assistant turn — if we already have text, finalize previous message
            // and create a new one for this turn
            if (turnText && currentMsgId) {
              await this.supabase
                .from("chat_messages")
                .update({ content: turnText, status: "done" })
                .eq("id", currentMsgId);

              // Create new message for subsequent turns
              const { data: newMsg } = await this.supabase
                .from("chat_messages")
                .insert({
                  instance_id: instanceId,
                  role: "assistant",
                  content: "",
                  status: "streaming",
                })
                .select()
                .single();

              if (newMsg) {
                currentMsgId = newMsg.id;
                turnText = "";
              }
            } else {
              // First message_start — reuse the initial placeholder
              // (currentMsgId is already assistantMsgId, turnText is empty)
              turnText = "";
            }
          } else if (streamEvent?.type === "content_block_delta") {
            const delta = streamEvent.delta;
            if (delta?.type === "text_delta" && delta.text) {
              fullText += delta.text;
              turnText += delta.text;
              this.emit("text_delta", instanceId, delta.text);

              // Update assistant message periodically
              const debounceChars = parseInt(process.env.STREAMING_DEBOUNCE_CHARS || "50", 10);
              const isFirstUpdate = turnText.length === delta.text.length;
              if (isFirstUpdate || turnText.length % debounceChars < delta.text.length) {
                await this.supabase
                  .from("chat_messages")
                  .update({ content: turnText, status: "streaming" })
                  .eq("id", currentMsgId);
              }
            }
          } else if (streamEvent?.type === "content_block_start") {
            if (streamEvent.content_block?.type === "tool_use") {
              const toolName = streamEvent.content_block.name;
              const toolId = streamEvent.content_block.id;

              this.emit("tool_start", instanceId, {
                toolCallId: toolId,
                toolName,
                toolInput: {},
              });

              // Store tool call as a separate message so it shows in the chat
              await this.supabase
                .from("chat_messages")
                .insert({
                  instance_id: instanceId,
                  role: "assistant",
                  content: JSON.stringify(streamEvent.content_block.input || {}),
                  tool_name: toolName,
                  tool_id: toolId,
                  is_error: false,
                  status: "done",
                });
            }
          }
        } else if (event.type === "result") {
          // Capture session ID
          if (event.session_id) {
            await this.supabase
              .from("instances")
              .update({ current_session_id: event.session_id })
              .eq("id", instanceId);
          }

          this.emit("message_done", instanceId, {
            sessionId: event.session_id,
            totalCostUsd: event.total_cost_usd,
          });
        }
      }
    } catch (err: any) {
      const errorMsg = err?.message || "Unknown error";
      console.error(`[InstanceManager] Error for ${instanceId}:`, errorMsg);

      let code = "sdk_error";
      let retryable = false;

      if (errorMsg.includes("rate_limit") || errorMsg.includes("429")) {
        code = "rate_limit";
        retryable = true;
      } else if (
        errorMsg.includes("context") ||
        errorMsg.includes("too long")
      ) {
        code = "context_overflow";
      }

      this.emit("error", instanceId, {
        code,
        message: errorMsg,
        retryable,
      });

      // Mark current assistant message as error so the phone UI can show it
      if (currentMsgId) {
        await this.supabase
          .from("chat_messages")
          .update({
            content: turnText || fullText || `Error: ${errorMsg}`,
            status: "error",
          })
          .eq("id", currentMsgId);
      }
      await this.updateStatus(instanceId, "error", errorMsg);
      errorOccurred = true;
    } finally {
      // Finalize the current turn's message
      if (currentMsgId && turnText) {
        await this.supabase
          .from("chat_messages")
          .update({
            content: turnText,
            status: "done",
          })
          .eq("id", currentMsgId);
      }

      this.activeQueries.delete(instanceId);
      this.semaphore.release();
      if (!errorOccurred) {
        await this.updateStatus(instanceId, "idle");
      }

      // Start idle timer
      this.startIdleTimer(instanceId);
    }
  }

  private async mockQuery(
    instanceId: string,
    message: string,
    assistantMsgId: string | undefined
  ): Promise<void> {
    // Parse attachments for mock response
    const { text, attachments } = this.parseAttachments(message);
    const imageCount = attachments.filter(a => a.type === "image").length;
    const fileCount = attachments.filter(a => a.type === "file").length;

    // Mock response for development when SDK is not available
    let attachmentInfo = "";
    if (imageCount > 0 || fileCount > 0) {
      attachmentInfo = `\n\nI also received ${imageCount} image(s) and ${fileCount} file(s).`;
    }
    const mockResponse = `I received your message: "${text}"${attachmentInfo}\n\nThis is a mock response because the Claude Agent SDK is not installed in this environment. In production, this would be a real Claude Code response with tool calls, file edits, and more.\n\nThe instance is configured at: ${instanceId}`;

    let sent = "";
    const words = mockResponse.split(" ");
    for (const word of words) {
      sent += (sent ? " " : "") + word;
      this.emit("text_delta", instanceId, (sent.length > word.length ? " " : "") + word);
      await new Promise((r) => setTimeout(r, 50));
    }

    if (assistantMsgId) {
      await this.supabase
        .from("chat_messages")
        .update({ content: mockResponse, status: "done" })
        .eq("id", assistantMsgId);
    }

    this.emit("message_done", instanceId, {
      sessionId: null,
      totalCostUsd: 0,
    });

    // Cleanup (activeQueries.delete, semaphore.release, updateStatus)
    // is handled by the caller's finally block in sendMessage()
  }

  private async handlePermissionRequest(
    instanceId: string,
    toolName: string,
    toolInput: ToolInput
  ): Promise<{ behavior: string; message?: string }> {
    const requestId = crypto.randomUUID();
    const timeoutAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Write to DB for persistence across reconnects
    await this.supabase.from("permission_requests").insert({
      id: requestId,
      instance_id: instanceId,
      tool_name: toolName,
      tool_input: toolInput,
      status: "pending",
      timeout_at: timeoutAt,
    });

    // Notify via event
    this.emit("permission_request", instanceId, {
      id: requestId,
      toolName,
      toolInput,
      timeoutAt,
    });

    // Wait for user response or timeout
    const approved = await new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingPermissions.has(requestId)) {
          this.pendingPermissions.delete(requestId);
          this.supabase
            .from("permission_requests")
            .update({ status: "timed_out", resolved_at: new Date().toISOString() })
            .eq("id", requestId)
            .then(() => {});
          resolve(false);
        }
      }, 5 * 60 * 1000);

      this.pendingPermissions.set(requestId, { resolve, timeoutId });
    });

    return approved
      ? { behavior: "allow" }
      : { behavior: "deny", message: "Denied by user" };
  }

  resolvePermission(requestId: string, approved: boolean): boolean {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeoutId);
    this.pendingPermissions.delete(requestId);

    // Update DB
    this.supabase
      .from("permission_requests")
      .update({
        status: approved ? "approved" : "denied",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .then(() => {});

    pending.resolve(approved);
    return true;
  }

  async interrupt(instanceId: string): Promise<boolean> {
    // Handle queued instances (waiting for semaphore)
    if (this.queuedInstances.has(instanceId)) {
      console.log(`[InstanceManager] Marking queued instance ${instanceId} for interrupt`);
      this.interruptedInstances.add(instanceId);
      // Status will be set to idle when the query checks after acquiring semaphore
      return true;
    }

    // Handle running instances (have an AbortController)
    const controller = this.activeQueries.get(instanceId);
    if (!controller) return false;

    console.log(`[InstanceManager] Aborting running instance ${instanceId}`);
    controller.abort();
    this.activeQueries.delete(instanceId);
    await this.updateStatus(instanceId, "idle");
    return true;
  }

  // Check if instance is running or queued
  isRunningOrQueued(instanceId: string): boolean {
    return this.activeQueries.has(instanceId) || this.queuedInstances.has(instanceId);
  }

  private startIdleTimer(instanceId: string) {
    // Clear existing timer
    const existing = this.idleTimers.get(instanceId);
    if (existing) clearTimeout(existing);

    // Warning 1 minute before timeout
    if (this.idleTimeoutMs > 60000) {
      setTimeout(() => {
        if (
          !this.activeQueries.has(instanceId) &&
          this.idleTimers.has(instanceId)
        ) {
          this.emit("status_change", instanceId, "stopped", "Going idle soon");
        }
      }, this.idleTimeoutMs - 60000);
    }

    // Actual timeout
    const timer = setTimeout(async () => {
      this.idleTimers.delete(instanceId);
      if (!this.activeQueries.has(instanceId)) {
        await this.updateStatus(instanceId, "stopped");
      }
    }, this.idleTimeoutMs);

    this.idleTimers.set(instanceId, timer);
  }

  async getInstanceStates(): Promise<InstanceState[]> {
    const instances = await this.getInstances();
    const { data: pendingPerms } = await this.supabase
      .from("permission_requests")
      .select("*")
      .eq("status", "pending");

    return instances.map((inst) => ({
      id: inst.id,
      name: inst.name,
      repoPath: inst.repo_path,
      status: inst.status as InstanceStatus,
      currentSessionId: inst.current_session_id,
      permissionMode: (inst.permission_mode || "auto") as InstanceState["permissionMode"],
      error: inst.error_message || undefined,
      pendingPermissions: (pendingPerms || [])
        .filter((p: any) => p.instance_id === inst.id)
        .map((p: any) => ({
          id: p.id,
          toolName: p.tool_name,
          input: p.tool_input || {},
          requestedAt: p.created_at,
        })),
      lastMessagePreview: undefined,
      lastActivityAt: inst.updated_at || null,
    }));
  }

  isRunning(instanceId: string): boolean {
    return this.activeQueries.has(instanceId);
  }

  getActiveQueryCount(): number {
    return this.activeQueries.size;
  }

  getQueueLength(): number {
    return this.semaphore.queueLength;
  }

  async shutdown(): Promise<void> {
    // Interrupt all active queries
    for (const [id, controller] of this.activeQueries) {
      controller.abort();
      await this.updateStatus(id, "stopped");
    }
    this.activeQueries.clear();

    // Clear all idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    // Clear pending permissions
    for (const [, pending] of this.pendingPermissions) {
      clearTimeout(pending.timeoutId);
      pending.resolve(false);
    }
    this.pendingPermissions.clear();
  }
}

// Singleton instance
let manager: InstanceManager | null = null;

export function getInstanceManager(): InstanceManager {
  if (!manager) {
    manager = new InstanceManager();
  }
  return manager;
}
