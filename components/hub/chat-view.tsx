"use client";
// ---------------------------------------------------------------------------
// ChatView — Container for the chat experience for a single instance
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { PermissionBanner } from "./permission-banner";
import { StatusBadge } from "./status-badge";
import type {
  DbMessage,
  DbInstance,
  DbPendingPermission,
  InstanceStatus,
} from "@/lib/types";

interface ChatViewProps {
  instance: DbInstance;
  messages: DbMessage[];
  pendingPermissions: DbPendingPermission[];
  onSendMessage: (instanceId: string, text: string) => Promise<void>;
  onInterrupt: (instanceId: string) => Promise<void>;
  onApprovePermission: (permissionId: string) => Promise<void>;
  onDenyPermission: (permissionId: string) => Promise<void>;
  onLoadMessages: (instanceId: string) => Promise<void>;
}

function MessageSkeleton({ align }: { align: "left" | "right" }) {
  return (
    <div
      className={`flex ${align === "right" ? "justify-end" : "justify-start"} px-4`}
    >
      <div
        className={`rounded-2xl px-4 py-3 max-w-[75%] ${
          align === "right"
            ? "bg-hub-accent/20"
            : "bg-hub-surface-2"
        }`}
      >
        <div className="space-y-2 animate-pulse">
          <div
            className="h-3 rounded bg-hub-text-muted/20"
            style={{ width: align === "right" ? "120px" : "180px" }}
          />
          <div
            className="h-3 rounded bg-hub-text-muted/20"
            style={{ width: align === "right" ? "80px" : "140px" }}
          />
        </div>
      </div>
    </div>
  );
}

function LoadingSkeletons() {
  return (
    <div className="flex-1 flex flex-col justify-end gap-3 py-4">
      <MessageSkeleton align="right" />
      <MessageSkeleton align="left" />
      <MessageSkeleton align="right" />
    </div>
  );
}

export function ChatView({
  instance,
  messages,
  pendingPermissions,
  onSendMessage,
  onInterrupt,
  onApprovePermission,
  onDenyPermission,
  onLoadMessages,
}: ChatViewProps) {
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearingSession, setClearingSession] = useState(false);

  // Load messages when instance changes
  useEffect(() => {
    setLoading(true);
    onLoadMessages(instance.id).finally(() => setLoading(false));
  }, [instance.id, onLoadMessages]);

  // Filter messages for this instance
  const instanceMessages = useMemo(
    () =>
      messages
        .filter((m) => m.instance_id === instance.id)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
        ),
    [messages, instance.id],
  );

  // Filter permissions for this instance
  const instancePermissions = useMemo(
    () =>
      pendingPermissions.filter(
        (p) => p.instance_id === instance.id && p.status === "pending",
      ),
    [pendingPermissions, instance.id],
  );

  // Detect streaming: find assistant message with status === "streaming"
  useEffect(() => {
    const streamingMsg = instanceMessages.find(
      (m) => m.role === "assistant" && m.status === "streaming"
    );
    setStreamingId(streamingMsg?.id ?? null);
  }, [instanceMessages]);

  const handleSend = useCallback(
    (text: string) => {
      onSendMessage(instance.id, text);
    },
    [instance.id, onSendMessage],
  );

  const handleInterrupt = useCallback(() => {
    onInterrupt(instance.id);
  }, [instance.id, onInterrupt]);

  // New Chat: clears the session_id so the next message starts a fresh Claude
  // conversation. Previous messages remain visible (no visual separator needed —
  // the user explicitly clicked "New Chat"). A system-message separator is not
  // inserted because the messages API only creates role="user" rows; a client-side
  // divider could be added in the future if desired.
  const handleNewChat = useCallback(async () => {
    if (clearingSession) return;
    setClearingSession(true);
    try {
      await fetch(`/api/instances/${instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_session_id: null }),
      });
      // Reload messages to reflect the cleared session
      await onLoadMessages(instance.id);
    } catch {
      // silently fail
    } finally {
      setClearingSession(false);
    }
  }, [instance.id, onLoadMessages, clearingSession]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-hub-border bg-hub-bg/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold truncate">
                {instance.name}
              </h1>
              <StatusBadge
                status={instance.status as InstanceStatus}
                showLabel
                errorMessage={instance.error_message || undefined}
              />
              <span className="text-xs text-hub-text-muted ml-2">
                {instance.model || "sonnet"}
              </span>
            </div>
            <p className="text-xs text-hub-text-muted truncate mt-0.5">
              {instance.repo_path}
            </p>
          </div>

          {/* New Chat button */}
          <button
            type="button"
            onClick={handleNewChat}
            disabled={clearingSession}
            className="flex-shrink-0 h-8 flex items-center justify-center px-2 rounded-lg hover:bg-hub-surface-2 text-hub-text-muted hover:text-hub-text disabled:opacity-50 transition-colors focus:outline-none"
            aria-label="New chat"
            title="New chat"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            <span className="text-[10px] ml-1">New</span>
          </button>
        </div>
      </div>

      {/* Permission banners */}
      {instancePermissions.map((perm) => (
        <PermissionBanner
          key={perm.id}
          permission={perm}
          onApprove={onApprovePermission}
          onDeny={onDenyPermission}
        />
      ))}

      {/* Messages */}
      {loading ? (
        <LoadingSkeletons />
      ) : (
        <MessageList
          messages={instanceMessages}
          streamingMessageId={streamingId}
        />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        instanceStatus={instance.status as InstanceStatus}
      />
    </div>
  );
}
