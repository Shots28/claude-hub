"use client";
// ---------------------------------------------------------------------------
// ChatView — Container for the chat experience for a single instance
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageList } from "./message-list";
import { ChatInput, type Attachment } from "./chat-input";
import { PermissionBanner } from "./permission-banner";
import { ThinkingIndicator } from "./thinking-indicator";
import { ErrorBanner } from "./error-banner";
import { PlanViewer } from "./plan-viewer";
import { TaskPanel, useTaskCount } from "./task-panel";
import { useBridgeStatus } from "@/lib/use-bridge-status";
import type {
  DbInstance,
  DbPendingPermission,
  InstanceStatus,
  MessageAttachment,
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
  onSendMessage: (instanceId: string, text: string, attachments?: MessageAttachment[]) => Promise<void>;
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
  const [updatingMode, setUpdatingMode] = useState(false);
  const [updatingEffort, setUpdatingEffort] = useState(false);
  const [updatingModel, setUpdatingModel] = useState(false);
  const bridgeStatus = useBridgeStatus();

  // Plan viewer / tasks state
  const [viewingPlan, setViewingPlan] = useState<string | null>(null);
  const [showTasks, setShowTasks] = useState(false);
  const taskCount = useTaskCount();

  // Load messages when instance changes OR component mounts
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  useEffect(() => {
    console.log("[ChatView] Loading messages for instance:", instance.id);
    retryCountRef.current = 0;
    setLoading(true);

    onLoadMessages(instance.id).finally(() => {
      console.log("[ChatView] loadMessages complete");
      setLoading(false);
    });
  }, [instance.id, onLoadMessages]);

  // Filter messages for this instance
  const instanceMessages = useMemo(
    () => {
      const filtered = messages.filter((m) => m.instance_id === instance.id);
      console.log(`[ChatView] Filtering messages: total=${messages.length}, forInstance=${filtered.length}, instanceId=${instance.id}`);
      if (messages.length > 0 && filtered.length === 0) {
        // Debug: log sample message to see why filter fails
        console.log("[ChatView] Sample message instance_ids:", messages.slice(0, 3).map(m => m.instance_id));
      }
      return filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    },
    [messages, instance.id]
  );

  // Retry loading if we got 0 messages (possible race condition or API issue)
  useEffect(() => {
    if (!loading && instanceMessages.length === 0 && retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      console.log(`[ChatView] No messages after load, retrying (${retryCountRef.current}/${maxRetries})...`);
      const timer = setTimeout(() => {
        onLoadMessages(instance.id);
      }, 500 * retryCountRef.current); // Exponential backoff: 500ms, 1000ms, 1500ms
      return () => clearTimeout(timer);
    }
  }, [loading, instanceMessages.length, instance.id, onLoadMessages]);

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
    // Process attachments - convert images to base64 for Claude's vision API
    if (attachments && attachments.length > 0) {
      const processedAttachments: MessageAttachment[] = [];

      for (const attachment of attachments) {
        if (attachment.type === "image" && attachment.preview) {
          // Extract base64 data from data URL (format: data:image/png;base64,...)
          const match = attachment.preview.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            processedAttachments.push({
              type: "image",
              media_type: match[1],
              data: match[2],
              name: attachment.name,
            });
          }
        } else if (attachment.type === "file") {
          // Read text file content
          try {
            const content = await attachment.file.text();
            processedAttachments.push({
              type: "file",
              name: attachment.name,
              content,
            });
          } catch {
            console.warn(`[ChatView] Could not read file: ${attachment.name}`);
          }
        }
      }

      // Send with attachments
      await onSendMessage(instance.id, text, processedAttachments.length > 0 ? processedAttachments : undefined);
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

  const modeConfig = getModeConfig(currentMode);
  const effortConfig = EFFORT_LEVELS.find(e => e.value === currentEffort) || EFFORT_LEVELS[1];
  const modelConfig = getModelConfig(currentModel);
  const isRunning = instance.status === "running";
  const isQueued = instance.status === "queued";
  const isBusy = isRunning || isQueued;

  return (
    <div className="flex flex-col h-full overflow-x-hidden" style={{ touchAction: "pan-y", overscrollBehaviorX: "none" }}>
      {/* Header - Clean and minimal */}
      <div className="flex-shrink-0 border-b border-hub-border bg-hub-bg/80 backdrop-blur-sm px-4 py-2.5">
        <div className="max-w-3xl mx-auto">
          {/* Top row: Name + status indicators */}
          <div className="flex items-center gap-2 min-w-0 mb-2">
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

            {/* Tasks — visually distinct from setting pills */}
            <div className="ml-auto relative">
              <button
                type="button"
                onClick={() => setShowTasks(true)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-hub-surface-2 hover:bg-hub-border text-hub-text-muted hover:text-hub-text transition-all active:scale-95"
                title="Tasks"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </button>
              {taskCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-bold px-1">
                  {taskCount}
                </span>
              )}
            </div>
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
          onSendResponse={(response) => handleSend(response)}
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
        instanceId={instance.id}
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        instanceStatus={instance.status as InstanceStatus}
        modeBorderClass={modeConfig.borderColor}
      />

      {/* Plan viewer modal */}
      {viewingPlan && (
        <PlanViewer
          instanceId={instance.id}
          planPath={viewingPlan}
          instanceStatus={instance.status as InstanceStatus}
          onClose={() => setViewingPlan(null)}
        />
      )}

      {/* Task panel */}
      <TaskPanel
        open={showTasks}
        onClose={() => setShowTasks(false)}
        onPushToChat={(text) => {
          handleSend(text);
        }}
      />

    </div>
  );
}
