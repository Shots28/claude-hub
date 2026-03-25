import { EventEmitter } from "events";
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

  async sendMessage(instanceId: string, message: string): Promise<void> {
    // Check if instance already has active query
    if (this.activeQueries.has(instanceId)) {
      this.emit("error", instanceId, {
        code: "instance_busy",
        message: "Instance is busy — interrupt first",
        retryable: false,
      });
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

    // Check concurrency - queue if needed
    const queuePos = this.semaphore.queueLength;
    if (queuePos > 0) {
      await this.updateStatus(instanceId, "queued");
      this.emit("queue_position", instanceId, queuePos);
    }

    await this.semaphore.acquire();

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

      const queryOptions: any = {
        cwd: instance.repo_path,
        includePartialMessages: true,
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        permissionMode: ["bypassPermissions", "acceptEdits", "plan", "default"].includes(instance.permission_mode)
          ? instance.permission_mode
          : "default",
      };

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

      // Try to resume session; if it fails, retry without resume
      let queryIterable: AsyncIterable<any>;
      if (instance.current_session_id) {
        try {
          const resumeOpts = { ...queryOptions, resume: instance.current_session_id };
          queryIterable = query({ prompt: message, options: resumeOpts });
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
          console.log(`[InstanceManager] Resume failed for ${instanceId}, starting fresh`);
          await this.supabase
            .from("instances")
            .update({ current_session_id: null })
            .eq("id", instanceId);
          queryIterable = query({ prompt: message, options: queryOptions });
        }
      } else {
        queryIterable = query({ prompt: message, options: queryOptions });
      }

      for await (const event of queryIterable) {
        if (controller.signal.aborted) break;

        // Handle different event types
        if (event.type === "stream_event") {
          const streamEvent = event.event;

          if (streamEvent?.type === "content_block_delta") {
            const delta = streamEvent.delta;
            if (delta?.type === "text_delta" && delta.text) {
              fullText += delta.text;
              this.emit("text_delta", instanceId, delta.text);

              // Update assistant message periodically
              if (fullText.length % 200 < delta.text.length) {
                await this.supabase
                  .from("chat_messages")
                  .update({ content: fullText })
                  .eq("id", assistantMsgId);
              }
            }
          } else if (streamEvent?.type === "content_block_start") {
            if (streamEvent.content_block?.type === "tool_use") {
              this.emit("tool_start", instanceId, {
                toolCallId: streamEvent.content_block.id,
                toolName: streamEvent.content_block.name,
                toolInput: {},
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

      // Mark assistant message as error so the phone UI can show it
      if (assistantMsgId) {
        await this.supabase
          .from("chat_messages")
          .update({
            content: fullText || `Error: ${errorMsg}`,
            status: "error",
          })
          .eq("id", assistantMsgId);
      }
      await this.updateStatus(instanceId, "error", errorMsg);
    } finally {
      // Finalize assistant message (only if not already handled by error path)
      if (assistantMsgId && fullText) {
        await this.supabase
          .from("chat_messages")
          .update({
            content: fullText,
            status: "done",
          })
          .eq("id", assistantMsgId);
      }

      this.activeQueries.delete(instanceId);
      this.semaphore.release();
      await this.updateStatus(instanceId, "idle");

      // Start idle timer
      this.startIdleTimer(instanceId);
    }
  }

  private async mockQuery(
    instanceId: string,
    message: string,
    assistantMsgId: string | undefined
  ): Promise<void> {
    // Mock response for development when SDK is not available
    const mockResponse = `I received your message: "${message}"\n\nThis is a mock response because the Claude Agent SDK is not installed in this environment. In production, this would be a real Claude Code response with tool calls, file edits, and more.\n\nThe instance is configured at: ${instanceId}`;

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

    this.activeQueries.delete(instanceId);
    this.semaphore.release();
    await this.updateStatus(instanceId, "idle");
    this.startIdleTimer(instanceId);
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
    const controller = this.activeQueries.get(instanceId);
    if (!controller) return false;

    controller.abort();
    this.activeQueries.delete(instanceId);
    await this.updateStatus(instanceId, "idle");
    return true;
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
