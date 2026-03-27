"use client";
// ---------------------------------------------------------------------------
// ChatView — Container for the chat experience for a single instance
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageList } from "./message-list";
import { ChatInput, type Attachment } from "./chat-input";
import { PermissionBanner } from "./permission-banner";
import { ThinkingIndicator } from "./thinking-indicator";
import { ErrorBanner } from "./error-banner";
import { FileViewer } from "./file-viewer";
import { PlanViewer } from "./plan-viewer";
import { FileActivity } from "./file-activity";
import { useBridgeStatus } from "@/lib/use-bridge-status";
import { useFileActivity } from "@/lib/use-file-activity";
import type {
  DbInstance,
  DbPendingPermission,
  InstanceStatus,
  PermissionMode,
  UiMessage,
} from "@/lib/types";

// Permission modes config
const PERMISSION_MODES: { value: PermissionMode; short: string; color: string; borderColor: string }[] = [
  { value: "bypassPermissions", short: "Bypass", color: "bg-red-500/15 text-red-400 border-red-500/30", borderColor: "border-red-500/50" },
  { value: "acceptEdits", short: "Auto-edit", color: "bg-orange-500/15 text-orange-400 border-orange-500/30", borderColor: "border-orange-500/50" },
  { value: "plan", short: "Plan", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", borderColor: "border-blue-500/50" },
  { value: "default", short: "Ask", color: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30", borderColor: "border-hub-border" },
];

// Effort levels config - 4 levels matching Claude Code's budget_tokens options
const EFFORT_LEVELS: { value: string; short: string; tokens: number }[] = [
  { value: "low", short: "Quick", tokens: 1024 },
  { value: "medium", short: "Normal", tokens: 10000 },
  { value: "high", short: "Deep", tokens: 50000 },
  { value: "max", short: "Max", tokens: 128000 },
];

// Model config
const MODELS: { value: string; short: string; color: string }[] = [
  { value: "opus", short: "Opus", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { value: "sonnet", short: "Sonnet", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { value: "haiku", short: "Haiku", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
];

function getModeConfig(mode: PermissionMode) {
  return PERMISSION_MODES.find(m => m.value === mode) || PERMISSION_MODES[3];
}

function getEffortFromTokens(tokens: number): string {
  if (tokens <= 2048) return "low";
  if (tokens <= 20000) return "medium";
  if (tokens <= 80000) return "high";
  return "max";
}

function getModelConfig(model: string) {
  return MODELS.find(m => m.value === model) || MODELS[1]; // default to sonnet
}

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
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"} px-4`}>
      <div className={`rounded-2xl px-4 py-3 max-w-[75%] ${align === "right" ? "bg-hub-accent/20" : "bg-hub-surface-2"}`}>
        <div className="space-y-2 animate-pulse">
          <div className="h-3 rounded bg-hub-text-muted/20" style={{ width: align === "right" ? "120px" : "180px" }} />
          <div className="h-3 rounded bg-hub-text-muted/20" style={{ width: align === "right" ? "80px" : "140px" }} />
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
  const [updatingMode, setUpdatingMode] = useState(false);
  const [updatingEffort, setUpdatingEffort] = useState(false);
  const [updatingModel, setUpdatingModel] = useState(false);
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
    () => messages
      .filter((m) => m.instance_id === instance.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages, instance.id]
  );

  // Extract file activity from messages
  const fileActivity = useFileActivity(instanceMessages);

  // Filter permissions for this instance
  const instancePermissions = useMemo(
    () => pendingPermissions.filter((p) => p.instance_id === instance.id && p.status === "pending"),
    [pendingPermissions, instance.id]
  );

  // Detect streaming
  useEffect(() => {
    const streamingMsg = instanceMessages.find((m) => m.role === "assistant" && m.status === "streaming");
    setStreamingId(streamingMsg?.id ?? null);
  }, [instanceMessages]);

  const handleSend = useCallback(async (text: string, attachments?: Attachment[]) => {
    // TODO: Handle file attachments - for now just send the text
    // When attachments are provided, they would need to be uploaded and their
    // references included in the message
    if (attachments && attachments.length > 0) {
      console.log("[ChatView] Attachments received:", attachments.map(a => a.name));
      // For now, include attachment names in the message
      const attachmentInfo = attachments.map(a => `[Attached: ${a.name}]`).join(" ");
      await onSendMessage(instance.id, `${text}\n\n${attachmentInfo}`);
    } else {
      await onSendMessage(instance.id, text);
    }
  }, [instance.id, onSendMessage]);

  const handleInterrupt = useCallback(() => {
    onInterrupt(instance.id);
  }, [instance.id, onInterrupt]);

  // Mode state
  const [optimisticMode, setOptimisticMode] = useState<PermissionMode | null>(null);
  const currentMode: PermissionMode = optimisticMode ?? (instance.permission_mode as PermissionMode);

  useEffect(() => {
    setOptimisticMode(null);
  }, [instance.permission_mode]);

  const handleModeCycle = useCallback(async () => {
    if (updatingMode) return;
    const currentIndex = PERMISSION_MODES.findIndex(m => m.value === currentMode);
    const nextIndex = (currentIndex + 1) % PERMISSION_MODES.length;
    const nextMode = PERMISSION_MODES[nextIndex].value;
    setOptimisticMode(nextMode);
    setUpdatingMode(true);
    try {
      await fetch(`/api/instances/${instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionMode: nextMode }),
      });
    } catch {
      setOptimisticMode(null);
    } finally {
      setUpdatingMode(false);
    }
  }, [instance.id, currentMode, updatingMode]);

  // Effort state
  const [optimisticEffort, setOptimisticEffort] = useState<string | null>(null);
  const currentEffort = optimisticEffort ?? getEffortFromTokens(instance.max_thinking_tokens || 8192);

  useEffect(() => {
    setOptimisticEffort(null);
  }, [instance.max_thinking_tokens]);

  const handleEffortCycle = useCallback(async () => {
    if (updatingEffort) return;
    const currentIndex = EFFORT_LEVELS.findIndex(e => e.value === currentEffort);
    const nextIndex = (currentIndex + 1) % EFFORT_LEVELS.length;
    const nextEffort = EFFORT_LEVELS[nextIndex];
    setOptimisticEffort(nextEffort.value);
    setUpdatingEffort(true);
    try {
      await fetch(`/api/instances/${instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_thinking_tokens: nextEffort.tokens }),
      });
    } catch {
      setOptimisticEffort(null);
    } finally {
      setUpdatingEffort(false);
    }
  }, [instance.id, currentEffort, updatingEffort]);

  // Model state
  const [optimisticModel, setOptimisticModel] = useState<string | null>(null);
  const currentModel = optimisticModel ?? (instance.model || "sonnet");

  useEffect(() => {
    setOptimisticModel(null);
  }, [instance.model]);

  const handleModelCycle = useCallback(async () => {
    if (updatingModel) return;
    const currentIndex = MODELS.findIndex(m => m.value === currentModel);
    const nextIndex = (currentIndex + 1) % MODELS.length;
    const nextModel = MODELS[nextIndex];
    setOptimisticModel(nextModel.value);
    setUpdatingModel(true);
    try {
      await fetch(`/api/instances/${instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: nextModel.value }),
      });
    } catch {
      setOptimisticModel(null);
    } finally {
      setUpdatingModel(false);
    }
  }, [instance.id, currentModel, updatingModel]);

  // New Chat handler
  const handleNewChat = useCallback(async () => {
    if (clearingSession) return;
    setClearingSession(true);
    try {
      await fetch(`/api/instances/${instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_session_id: null }),
      });
      await onLoadMessages(instance.id);
    } catch {
      // silently fail
    } finally {
      setClearingSession(false);
    }
  }, [instance.id, onLoadMessages, clearingSession]);

  const modeConfig = getModeConfig(currentMode);
  const effortConfig = EFFORT_LEVELS.find(e => e.value === currentEffort) || EFFORT_LEVELS[1];
  const modelConfig = getModelConfig(currentModel);
  const isRunning = instance.status === "running";
  const isQueued = instance.status === "queued";
  const isBusy = isRunning || isQueued;

  return (
    <div className="flex flex-col h-full">
      {/* Header - Clean and minimal */}
      <div className="flex-shrink-0 border-b border-hub-border bg-hub-bg/80 backdrop-blur-sm px-4 py-2.5">
        <div className="max-w-3xl mx-auto">
          {/* Top row: Name + New Chat */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold truncate">{instance.name}</h1>
              {/* Simple status indicator */}
              {isBusy && (
                <span className="flex items-center gap-1.5 text-xs text-blue-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  {isQueued ? "Queued" : "Working"}
                </span>
              )}
              {instancePermissions.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-orange-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  Waiting
                </span>
              )}
              {instance.status === "error" && (
                <span className="text-xs text-red-400">Error</span>
              )}
              {/* Bridge indicator - very subtle */}
              {bridgeStatus.health === "offline" && (
                <span className="text-[10px] text-yellow-500">Offline</span>
              )}
            </div>

            {/* New Chat button - clear and tappable */}
            <button
              type="button"
              onClick={handleNewChat}
              disabled={clearingSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-hub-surface-2 hover:bg-hub-border active:bg-hub-border text-hub-text-muted hover:text-hub-text disabled:opacity-50 transition-all text-xs font-medium"
              aria-label="New chat"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
          </div>

          {/* Bottom row: Tappable pills for Mode, Effort, Files */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode pill - clearly tappable */}
            <button
              type="button"
              onClick={handleModeCycle}
              disabled={updatingMode}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all active:scale-95 disabled:opacity-50 ${modeConfig.color}`}
              title="Tap to change permission mode"
            >
              {updatingMode ? "..." : modeConfig.short}
            </button>

            {/* Effort pill - clearly tappable */}
            <button
              type="button"
              onClick={handleEffortCycle}
              disabled={updatingEffort}
              className="px-2.5 py-1 rounded-full text-xs font-medium border bg-purple-500/15 text-purple-400 border-purple-500/30 transition-all active:scale-95 disabled:opacity-50"
              title="Tap to change thinking effort"
            >
              {updatingEffort ? "..." : effortConfig.short}
            </button>

            {/* Model pill - clearly tappable */}
            <button
              type="button"
              onClick={handleModelCycle}
              disabled={updatingModel}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all active:scale-95 disabled:opacity-50 ${modelConfig.color}`}
              title="Tap to change model"
            >
              {updatingModel ? "..." : modelConfig.short}
            </button>

            {/* File activity - if any */}
            {fileActivity.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFileActivity(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-hub-surface-2 hover:bg-hub-border text-hub-text-muted hover:text-hub-text transition-all"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {fileActivity.length}
              </button>
            )}
          </div>
        </div>
      </div>

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
        modeBorderClass={modeConfig.borderColor}
      />

      {/* File viewer modal */}
      {viewingFile && (
        <FileViewer
          instanceId={instance.id}
          filePath={viewingFile}
          onClose={() => setViewingFile(null)}
        />
      )}

      {/* Plan viewer modal */}
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
