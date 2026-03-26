"use client";
// ---------------------------------------------------------------------------
// ChatView — Container for the chat experience for a single instance
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { PermissionBanner } from "./permission-banner";
import { StatusBadge } from "./status-badge";
import { ThinkingIndicator } from "./thinking-indicator";
import { ErrorBanner } from "./error-banner";
import { FileViewer } from "./file-viewer";
import { PlanViewer } from "./plan-viewer";
import { FileActivity } from "./file-activity";
import { useBridgeStatus, type BridgeHealth } from "@/lib/use-bridge-status";
import { useFileActivity } from "@/lib/use-file-activity";
import type {
  DbInstance,
  DbPendingPermission,
  InstanceStatus,
  UiMessage,
} from "@/lib/types";

interface ChatViewProps {
  instance: DbInstance;
  messages: UiMessage[];
  pendingPermissions: DbPendingPermission[];
  connectionError: string | null;
  onClearError: () => void;
  onSendMessage: (instanceId: string, text: string) => Promise<void>;
  onRetryMessage: (optimisticId: string) => Promise<void>;
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
  connectionError,
  onClearError,
  onSendMessage,
  onRetryMessage,
  onInterrupt,
  onApprovePermission,
  onDenyPermission,
  onLoadMessages,
}: ChatViewProps) {
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearingSession, setClearingSession] = useState(false);
  const bridgeStatus = useBridgeStatus();

  // File viewer / plan viewer / file activity state
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [viewingPlan, setViewingPlan] = useState<string | null>(null);
  const [showFileActivity, setShowFileActivity] = useState(false);

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

  // Extract file activity from messages
  const fileActivity = useFileActivity(instanceMessages);

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
    async (text: string) => {
      await onSendMessage(instance.id, text);
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
                hasPermission={instancePermissions.length > 0}
                lastActivityAt={instance.last_activity_at || undefined}
              />
              {/* Bridge health dot */}
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  bridgeStatus.health === "connected"
                    ? "bg-emerald-400"
                    : bridgeStatus.health === "slow"
                      ? "bg-yellow-400"
                      : bridgeStatus.health === "offline"
                        ? "bg-red-400"
                        : "bg-hub-text-muted/30"
                }`}
                title={`Bridge: ${bridgeStatus.health}`}
              />
              <span className="text-xs text-hub-text-muted ml-2">
                {instance.model || "sonnet"}
              </span>
            </div>
            <p className="text-xs text-hub-text-muted truncate mt-0.5">
              {instance.repo_path}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* File activity button */}
            {fileActivity.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFileActivity(true)}
                className="relative h-8 flex items-center justify-center px-2 rounded-lg hover:bg-hub-surface-2 text-hub-text-muted hover:text-hub-text transition-colors focus:outline-none"
                aria-label={`${fileActivity.length} files touched`}
                title={`${fileActivity.length} files touched`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-hub-accent text-[9px] font-bold text-white px-1">
                  {fileActivity.length}
                </span>
              </button>
            )}

            {/* New Chat button */}
            <button
              type="button"
              onClick={handleNewChat}
              disabled={clearingSession}
              className="h-8 flex items-center justify-center px-2 rounded-lg hover:bg-hub-surface-2 text-hub-text-muted hover:text-hub-text disabled:opacity-50 transition-colors focus:outline-none"
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
      </div>

      {/* Bridge offline warning */}
      {bridgeStatus.health === "offline" && (
        <div className="flex-shrink-0 bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2">
          <p className="text-xs text-yellow-400 text-center">
            Bridge appears offline — your message will be queued
          </p>
        </div>
      )}

      {/* Connection error banner */}
      <ErrorBanner message={connectionError} onDismiss={onClearError} />

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
          onRetryMessage={onRetryMessage}
          onViewPlan={(planPath) => setViewingPlan(planPath)}
        />
      )}

      {/* Thinking/processing indicator */}
      <ThinkingIndicator
        instanceStatus={instance.status as InstanceStatus}
        messages={instanceMessages}
        pendingPermissions={instancePermissions}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        instanceStatus={instance.status as InstanceStatus}
      />

      {/* File viewer modal */}
      {viewingFile && (
        <FileViewer
          instanceId={instance.id}
          filePath={viewingFile}
          onClose={() => setViewingFile(null)}
        />
      )}

      {/* Plan viewer modal (with auto-refresh) */}
      {viewingPlan && (
        <PlanViewer
          instanceId={instance.id}
          planPath={viewingPlan}
          instanceStatus={instance.status as InstanceStatus}
          onClose={() => setViewingPlan(null)}
        />
      )}

      {/* File activity panel */}
      {showFileActivity && (
        <FileActivity
          files={fileActivity}
          onViewFile={(path) => {
            setShowFileActivity(false);
            setViewingFile(path);
          }}
          onClose={() => setShowFileActivity(false)}
        />
      )}
    </div>
  );
}
