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

  // Load messages when instance changes
  useEffect(() => {
    onLoadMessages(instance.id);
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

  // Detect streaming: last assistant message that might still be updating
  useEffect(() => {
    if (instance.status === "running" && instanceMessages.length > 0) {
      const last = instanceMessages[instanceMessages.length - 1];
      if (last.role === "assistant" && !last.tool_name) {
        setStreamingId(last.id);
      }
    } else {
      setStreamingId(null);
    }
  }, [instance.status, instanceMessages]);

  const handleSend = useCallback(
    (text: string) => {
      onSendMessage(instance.id, text);
    },
    [instance.id, onSendMessage],
  );

  const handleInterrupt = useCallback(() => {
    onInterrupt(instance.id);
  }, [instance.id, onInterrupt]);

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
              />
            </div>
            <p className="text-xs text-hub-text-muted truncate mt-0.5">
              {instance.repo_path}
            </p>
          </div>
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
      <MessageList
        messages={instanceMessages}
        streamingMessageId={streamingId}
      />

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onInterrupt={handleInterrupt}
        instanceStatus={instance.status as InstanceStatus}
      />
    </div>
  );
}
