"use client";
// ---------------------------------------------------------------------------
// Instance Chat Page — Main chat view for a specific Claude Code instance
// ---------------------------------------------------------------------------

import { use, useMemo } from "react";
import { ChatView } from "@/components/hub/chat-view";
import { useHubRealtime } from "@/lib/hub-context";

interface InstancePageProps {
  params: Promise<{ id: string }>;
}

export default function InstancePage({ params }: InstancePageProps) {
  const { id: instanceId } = use(params);
  const {
    instances,
    messages,
    pendingPermissions,
    connectionError,
    clearError,
    sendMessage,
    retryMessage,
    interrupt,
    approvePermission,
    denyPermission,
    loadMessages,
  } = useHubRealtime();

  const instance = useMemo(
    () => instances.find((i) => i.id === instanceId),
    [instances, instanceId],
  );

  if (!instance) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-hub-surface-2 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-hub-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="text-sm text-hub-text-muted mb-1">
            Instance not found
          </p>
          <p className="text-xs text-hub-text-muted/60">
            It may have been deleted or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ChatView
      instance={instance}
      messages={messages}
      pendingPermissions={pendingPermissions}
      connectionError={connectionError}
      onClearError={clearError}
      onSendMessage={sendMessage}
      onRetryMessage={retryMessage}
      onInterrupt={interrupt}
      onApprovePermission={approvePermission}
      onDenyPermission={denyPermission}
      onLoadMessages={loadMessages}
    />
  );
}
