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
} from "@/lib/types";

// ---- Public interface ----

export interface RealtimeState {
  messages: DbMessage[];
  instances: DbInstance[];
  pendingPermissions: DbPendingPermission[];
  connected: boolean;
  sendMessage: (instanceId: string, text: string) => Promise<void>;
  interrupt: (instanceId: string) => Promise<void>;
  approvePermission: (permissionId: string) => Promise<void>;
  denyPermission: (permissionId: string) => Promise<void>;
  refreshInstances: () => Promise<void>;
  loadMessages: (instanceId: string) => Promise<void>;
}

// ---- Hook ----

export function useRealtime(): RealtimeState {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [instances, setInstances] = useState<DbInstance[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<
    DbPendingPermission[]
  >([]);
  const [connected, setConnected] = useState(false);
  const supabaseRef = useRef(createBrowserClient());
  const activeInstanceRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // -- Load messages for a specific instance --
  const loadMessages = useCallback(async (instanceId: string) => {
    activeInstanceRef.current = instanceId; // Track for polling fallback
    try {
      const res = await fetch(`/api/instances/${instanceId}/messages`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      // silently fail
    }
  }, []);

  // -- Polling fallback: poll for updates when streaming (Realtime backup) --
  useEffect(() => {
    // Check if there's a streaming message
    const hasStreamingMsg = messages.some(
      (m) => m.role === "assistant" && m.status === "streaming"
    );

    // Clear existing poll interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Start polling if streaming and we have an active instance
    if (hasStreamingMsg && activeInstanceRef.current) {
      console.log("[realtime] Starting polling fallback for streaming message");
      const instanceId = activeInstanceRef.current;

      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/instances/${instanceId}/messages`, {
            credentials: "include",
          });
          if (res.ok) {
            const data = await res.json();
            const fetchedMsgs = data.messages ?? [];
            setMessages((prev) => {
              // Merge fetched messages with existing ones
              const merged = [...prev];
              for (const msg of fetchedMsgs) {
                const idx = merged.findIndex((m) => m.id === msg.id);
                if (idx >= 0) {
                  // Update existing message if content changed
                  if (merged[idx].content !== msg.content || merged[idx].status !== msg.status) {
                    merged[idx] = msg;
                  }
                } else if (!msg.id.startsWith("optimistic-")) {
                  merged.push(msg);
                }
              }
              return merged;
            });
          }
        } catch {
          // silently fail polling
        }
      }, 500); // Poll every 500ms during streaming
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [messages]);

  // -- Track active instance for polling fallback --
  const activeInstanceRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          const newMsg = payload.new as DbMessage;
          setMessages((prev) => {
            // Deduplicate
            if (prev.some((m) => m.id === newMsg.id)) return prev;
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
      .subscribe();

    // Initial data fetch
    refreshInstances();

    return () => {
      sb.removeChannel(messagesChannel);
      sb.removeChannel(instancesChannel);
      sb.removeChannel(permissionsChannel);
    };
  }, [refreshInstances]);

  // -- Actions --

  const sendMessage = useCallback(
    async (instanceId: string, text: string) => {
      // Optimistic UI — show message immediately
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: DbMessage = {
        id: optimisticId,
        instance_id: instanceId,
        role: "user",
        content: text,
        tool_name: null,
        tool_id: null,
        is_error: false,
        status: "done",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await fetch(`/api/instances/${instanceId}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (res.ok) {
          // Replace optimistic message with real one from server
          const data = await res.json();
          if (data.message) {
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticId ? data.message : m)),
            );
          }
        } else {
          // Remove optimistic message on failure
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          console.error("[realtime] sendMessage failed:", res.status);
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        console.error("[realtime] sendMessage error:", err);
      }
    },
    [],
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
      await fetch(`/api/permissions/${permissionId}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
    } catch (err) {
      console.error("[realtime] approvePermission error:", err);
    }
  }, []);

  const denyPermission = useCallback(async (permissionId: string) => {
    try {
      await fetch(`/api/permissions/${permissionId}/resolve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deny" }),
      });
    } catch (err) {
      console.error("[realtime] denyPermission error:", err);
    }
  }, []);

  return {
    messages,
    instances,
    pendingPermissions,
    connected,
    sendMessage,
    interrupt,
    approvePermission,
    denyPermission,
    refreshInstances,
    loadMessages,
  };
}
