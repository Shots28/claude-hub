"use client";
// ---------------------------------------------------------------------------
// Claude Hub — Supabase Realtime Hook
// ---------------------------------------------------------------------------
// Subscribes to Realtime channels for messages, instance status, and
// permission requests. Provides actions: sendMessage, interrupt,
// approvePermission, denyPermission.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import type {
  DbMessage,
  DbInstance,
  DbPendingPermission,
  InstanceStatus,
  MessageAttachment,
  UiMessage,
} from "@/lib/types";

// ---- Public interface ----

export interface RealtimeState {
  messages: UiMessage[];
  instances: DbInstance[];
  pendingPermissions: DbPendingPermission[];
  connected: boolean;
  connectionError: string | null;
  clearError: () => void;
  sendMessage: (instanceId: string, text: string, attachments?: MessageAttachment[]) => Promise<void>;
  retryMessage: (optimisticId: string) => Promise<void>;
  interrupt: (instanceId: string) => Promise<void>;
  approvePermission: (permissionId: string) => Promise<void>;
  denyPermission: (permissionId: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
  loadMessages: (instanceId: string) => Promise<void>;
}

// ---- Hook ----

export function useRealtime(): RealtimeState {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [instances, setInstances] = useState<DbInstance[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<
    DbPendingPermission[]
  >([]);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const supabaseRef = useRef(createBrowserClient());
  const activeInstanceRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sendRetryCountRef = useRef(0);

  const clearError = useCallback(() => {
    setConnectionError(null);
  }, []);

  // -- Fetch all instances on mount --
  const refreshInstances = useCallback(async () => {
    try {
      const res = await fetch("/api/instances", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances ?? []);
      }
    } catch {
      // silently fail — will retry on reconnect
    }
  }, []);

  // -- Fetch pending permissions on mount --
  const refreshPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPendingPermissions(data.permissions ?? []);
      }
    } catch {
      // silently fail — will retry on reconnect
    }
  }, []);

  // -- Load messages for a specific instance --
  const loadMessages = useCallback(async (instanceId: string) => {
    activeInstanceRef.current = instanceId; // Track for polling fallback
    console.log("[realtime] loadMessages called for instance:", instanceId);
    try {
      const res = await fetch(`/api/instances/${instanceId}/messages`, {
        credentials: "include",
        // Prevent caching to always get fresh data
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      console.log("[realtime] loadMessages response status:", res.status);
      if (res.ok) {
        const data = await res.json();
        const newMsgs: UiMessage[] = data.messages ?? [];
        console.log("[realtime] loadMessages received:", newMsgs.length, "messages for instance", instanceId);
        if (data._debug) {
          console.log("[realtime] API debug:", data._debug);
        }
        if (newMsgs.length > 0) {
          console.log("[realtime] First message:", newMsgs[0]?.id, newMsgs[0]?.role);
          console.log("[realtime] Last message:", newMsgs[newMsgs.length - 1]?.id, newMsgs[newMsgs.length - 1]?.role);
          // Debug: Count tool messages and check their content
          const toolMsgs = newMsgs.filter((m: any) => m.tool_name);
          console.log("[realtime] Tool messages:", toolMsgs.length);
          if (toolMsgs.length > 0) {
            const sample = toolMsgs[0];
            console.log("[realtime] Sample tool message:", { id: sample.id, tool_name: sample.tool_name, content_preview: sample.content?.slice(0, 100) });
          }
        }
        // Merge with existing messages instead of replacing
        // This preserves messages from other instances when switching
        setMessages((prev) => {
          // Remove old messages for this instance, keep others
          const otherInstanceMsgs = prev.filter(m => m.instance_id !== instanceId);
          console.log("[realtime] setMessages: keeping", otherInstanceMsgs.length, "other instance msgs, adding", newMsgs.length, "for", instanceId);
          return [...otherInstanceMsgs, ...newMsgs];
        });
      } else {
        const errorText = await res.text();
        console.error("[realtime] loadMessages failed:", res.status, errorText);
        setConnectionError(`Failed to load messages: ${res.status}`);
      }
    } catch (err) {
      console.error("[realtime] loadMessages error:", err);
      setConnectionError(`Failed to load messages: ${err instanceof Error ? err.message : "Network error"}`);
    }
  }, []);

  // -- Polling fallback: always poll while waiting for a response --
  // This is the primary mechanism for seeing responses since Supabase
  // Realtime may not work reliably in all browser/mobile contexts.
  const pollingActiveRef = useRef(false);

  const startPolling = useCallback((instanceId: string) => {
    if (pollingActiveRef.current) return;
    pollingActiveRef.current = true;
    console.log("[realtime] Starting message polling for", instanceId);

    const poll = async () => {
      if (!pollingActiveRef.current) return;
      try {
        const res = await fetch(`/api/instances/${instanceId}/messages`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const fetchedMsgs: DbMessage[] = data.messages ?? [];
          setMessages((prev) => {
            const merged = [...prev];
            let changed = false;
            for (const msg of fetchedMsgs) {
              const idx = merged.findIndex((m) => m.id === msg.id);
              if (idx >= 0) {
                if (merged[idx].content !== msg.content || merged[idx].status !== msg.status) {
                  merged[idx] = msg;
                  changed = true;
                }
              } else if (!msg.id.startsWith("optimistic-")) {
                // Before adding, check if there's an optimistic message with
                // matching content that this real message should replace
                if (msg.role === "user") {
                  const optIdx = merged.findIndex(
                    (m) => m.id.startsWith("optimistic-") && m.content === msg.content,
                  );
                  if (optIdx >= 0) {
                    merged[optIdx] = { ...msg, deliveryStatus: "delivered" as const };
                    changed = true;
                    continue;
                  }
                }
                merged.push(msg);
                changed = true;
              }
            }

            // Clean up stale optimistic messages:
            // - Remove "failed" messages older than 5 minutes
            // - NEVER remove "pending" messages by timeout
            const FIVE_MINUTES = 5 * 60 * 1000;
            const now = Date.now();
            const cleaned = merged.filter((m) => {
              if (!m.id.startsWith("optimistic-")) return true;
              if (m.deliveryStatus === "failed") {
                const age = now - new Date(m.created_at).getTime();
                if (age > FIVE_MINUTES) {
                  changed = true;
                  return false;
                }
              }
              return true;
            });

            return changed ? cleaned : prev;
          });

          // Check if there's still a streaming/pending response
          const stillStreaming = fetchedMsgs.some(
            (m) => m.role === "assistant" && m.status === "streaming"
          );
          // Also check if instance is still queued (bridge hasn't started yet)
          const instRes = await fetch(`/api/instances/${instanceId}`, {
            credentials: "include",
          });
          const instData = instRes.ok ? await instRes.json() : null;
          const instStatus = instData?.instance?.status;
          const stillBusy = instStatus === "running" || instStatus === "queued";

          if (!stillStreaming && !stillBusy) {
            console.log("[realtime] Polling complete — response done");
            pollingActiveRef.current = false;
            return;
          }
        }
      } catch {
        // silently fail
      }

      // Continue polling
      if (pollingActiveRef.current) {
        pollIntervalRef.current = setTimeout(poll, 1000);
      }
    };

    // Start first poll after a short delay
    pollIntervalRef.current = setTimeout(poll, 500);
  }, []);

  // -- Helper: clean up stale optimistic messages --
  const cleanStaleOptimistic = useCallback(() => {
    const FIVE_MINUTES = 5 * 60 * 1000;
    const now = Date.now();
    setMessages((prev) => {
      const cleaned = prev.filter((m) => {
        if (!m.id.startsWith("optimistic-")) return true;
        // Only clean up "failed" messages older than 5 minutes
        // NEVER remove "pending" messages by timeout
        if (m.deliveryStatus === "failed") {
          const age = now - new Date(m.created_at).getTime();
          return age <= FIVE_MINUTES;
        }
        return true;
      });
      return cleaned.length !== prev.length ? cleaned : prev;
    });
  }, []);

  // -- Subscribe to Realtime channels --
  useEffect(() => {
    const sb = supabaseRef.current;

    // Messages channel — subscribe to chat_messages (the realtime relay table)
    const messagesChannel = sb
      .channel("chat-messages-changes", {
        config: { broadcast: { self: true } },
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          console.log("[realtime] INSERT chat_message:", payload.new?.id);
          const newMsg = payload.new as UiMessage;
          setMessages((prev) => {
            // Deduplicate by real ID
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // If this is a user message, check if there's an optimistic message
            // with matching content that should be replaced (not duplicated)
            if (newMsg.role === "user") {
              const optimisticIdx = prev.findIndex(
                (m) => m.id.startsWith("optimistic-") && m.content === newMsg.content,
              );
              if (optimisticIdx >= 0) {
                // Replace the optimistic message with the real one
                const updated = [...prev];
                updated[optimisticIdx] = { ...newMsg, deliveryStatus: "delivered" as const };
                return updated;
              }
            }
            return [...prev, newMsg];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          console.log("[realtime] UPDATE chat_message:", payload.new?.id, "status:", (payload.new as any)?.status);
          const updated = payload.new as DbMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m)),
          );
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.error("[realtime] Messages channel error:", err);
        }
        console.log("[realtime] Messages channel:", status);
        setConnected(status === "SUBSCRIBED");
        // Log channel disconnects — visibility handler will refresh on foreground
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[realtime] Messages channel disconnected:", status);
        }
      });

    // Instances channel
    const instancesChannel = sb
      .channel("instances-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "instances" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newInst = payload.new as DbInstance;
            setInstances((prev) => {
              if (prev.some((i) => i.id === newInst.id)) return prev;
              return [...prev, newInst];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as DbInstance;
            setInstances((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i)),
            );
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<DbInstance>;
            setInstances((prev) => prev.filter((i) => i.id !== old.id));
          }
        },
      )
      .subscribe((status, err) => {
        console.log("[realtime] Instances channel:", status, err || "");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[realtime] Instances channel disconnected:", status);
        }
      });

    // Permissions channel — subscribe to permission_requests table
    const permissionsChannel = sb
      .channel("permissions-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "permission_requests" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const perm = payload.new as DbPendingPermission;
            setPendingPermissions((prev) => {
              if (prev.some((p) => p.id === perm.id)) return prev;
              return [...prev, perm];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as DbPendingPermission;
            if (updated.status !== "pending") {
              // Resolved — remove from pending
              setPendingPermissions((prev) =>
                prev.filter((p) => p.id !== updated.id),
              );
            } else {
              setPendingPermissions((prev) =>
                prev.map((p) => (p.id === updated.id ? updated : p)),
              );
            }
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<DbPendingPermission>;
            setPendingPermissions((prev) =>
              prev.filter((p) => p.id !== old.id),
            );
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[realtime] Permissions channel disconnected:", status, err || "");
        }
      });

    // -- Visibility change: refresh data when app comes to foreground --
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      console.log("[realtime] App foregrounded — refreshing data, activeInstance:", activeInstanceRef.current);
      refreshInstances();
      refreshPermissions();
      if (activeInstanceRef.current) {
        console.log("[realtime] Reloading messages for:", activeInstanceRef.current);
        loadMessages(activeInstanceRef.current);
      } else {
        console.log("[realtime] No active instance to reload messages for");
      }
      // Clean stale optimistic messages on foreground
      cleanStaleOptimistic();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial data fetch
    refreshInstances();
    refreshPermissions();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sb.removeChannel(messagesChannel);
      sb.removeChannel(instancesChannel);
      sb.removeChannel(permissionsChannel);
      pollingActiveRef.current = false;
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
    };
  }, [refreshInstances, refreshPermissions, loadMessages, cleanStaleOptimistic]);

  // -- Actions --

  const sendMessage = useCallback(
    async (instanceId: string, text: string, attachments?: MessageAttachment[]) => {
      // Build display content - include image indicators for UI
      let displayContent = text;
      if (attachments && attachments.length > 0) {
        const imageCount = attachments.filter(a => a.type === "image").length;
        const fileCount = attachments.filter(a => a.type === "file").length;
        const indicators: string[] = [];
        if (imageCount > 0) indicators.push(`📷 ${imageCount} image${imageCount > 1 ? "s" : ""}`);
        if (fileCount > 0) indicators.push(`📎 ${fileCount} file${fileCount > 1 ? "s" : ""}`);
        if (indicators.length > 0 && text) {
          displayContent = `${text}\n\n[${indicators.join(", ")}]`;
        } else if (indicators.length > 0) {
          displayContent = `[${indicators.join(", ")}]`;
        }
      }

      // Optimistic UI — show message immediately with "pending" delivery status
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: UiMessage = {
        id: optimisticId,
        instance_id: instanceId,
        role: "user",
        content: displayContent,
        tool_name: null,
        tool_id: null,
        is_error: false,
        status: "done",
        created_at: new Date().toISOString(),
        deliveryStatus: "pending",
        originalText: text,
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      // Exponential backoff with jitter for retries
      const MAX_RETRIES = 5;
      const BASE_DELAY = 1000;
      let attempt = 0;

      const doSend = async (): Promise<boolean> => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10_000);

          const res = await fetch(`/api/instances/${instanceId}/messages`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text, attachments }),
            signal: controller.signal,
            keepalive: true,
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            // Replace optimistic message with real one (delivered)
            const data = await res.json();
            console.log("[realtime] sendMessage success, got message:", data.message?.id, "instance_id:", data.message?.instance_id);
            if (data.message) {
              // Ensure message has instance_id (should come from DB, but verify)
              const savedMessage = {
                ...data.message,
                instance_id: data.message.instance_id || instanceId,
                deliveryStatus: "delivered" as const,
              };
              setMessages((prev) => {
                const found = prev.find(m => m.id === optimisticId);
                console.log("[realtime] Replacing optimistic message, found:", !!found, "optimisticId:", optimisticId);
                return prev.map((m) =>
                  m.id === optimisticId ? savedMessage : m,
                );
              });
            }
            // Reset retry count on success
            sendRetryCountRef.current = 0;
            // Start polling for the response
            startPolling(instanceId);
            return true;
          } else {
            console.error("[realtime] sendMessage failed:", res.status);
            return false;
          }
        } catch (err) {
          console.error("[realtime] sendMessage error:", err);
          return false;
        }
      };

      // First attempt
      if (await doSend()) return;

      // Retry with exponential backoff + jitter
      while (attempt < MAX_RETRIES) {
        attempt++;
        const delay = Math.min(BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000, 16_000);
        console.log(`[realtime] Retry attempt ${attempt}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));

        if (await doSend()) {
          sendRetryCountRef.current = 0;
          return;
        }
      }

      // All retries exhausted — mark as failed
      sendRetryCountRef.current = attempt;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...m, deliveryStatus: "failed" as const }
            : m,
        ),
      );
      setConnectionError("Failed to send message — tap to retry");
    },
    [startPolling],
  );

  // Retry a failed optimistic message
  const retryMessage = useCallback(
    async (optimisticId: string) => {
      const failedMsg = messages.find(
        (m) => m.id === optimisticId && m.deliveryStatus === "failed",
      );
      if (!failedMsg?.originalText) return;
      const { instance_id, originalText } = failedMsg;
      // Reset backoff timer on manual retry
      sendRetryCountRef.current = 0;
      clearError();
      // Remove the failed message, then re-send
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      await sendMessage(instance_id, originalText);
    },
    [messages, sendMessage, clearError],
  );

  const interrupt = useCallback(async (instanceId: string) => {
    try {
      await fetch(`/api/instances/${instanceId}/interrupt`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("[realtime] interrupt error:", err);
    }
  }, []);

  const approvePermission = useCallback(async (permissionId: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`/api/permissions/${permissionId}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        setConnectionError("Failed to approve permission — try again");
      }
    } catch (err) {
      console.error("[realtime] approvePermission error:", err);
      setConnectionError("Failed to approve permission — check connection");
    }
  }, []);

  const denyPermission = useCallback(async (permissionId: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`/api/permissions/${permissionId}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deny" }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        setConnectionError("Failed to deny permission — try again");
      }
    } catch (err) {
      console.error("[realtime] denyPermission error:", err);
      setConnectionError("Failed to deny permission — check connection");
    }
  }, []);

  return {
    messages,
    instances,
    pendingPermissions,
    connected,
    connectionError,
    clearError,
    sendMessage,
    retryMessage,
    interrupt,
    approvePermission,
    denyPermission,
    refreshInstances,
    loadMessages,
  };
}
