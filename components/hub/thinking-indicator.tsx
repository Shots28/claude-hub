"use client";
// ---------------------------------------------------------------------------
// ThinkingIndicator — Shows processing state below messages
// ---------------------------------------------------------------------------
// Derives state from instance status, message streaming, and pending permissions.
// No new API calls — uses existing polling data.
// ---------------------------------------------------------------------------

import type { InstanceStatus, DbPendingPermission, UiMessage } from "@/lib/types";

interface ThinkingIndicatorProps {
  instanceStatus: InstanceStatus;
  messages: UiMessage[];
  pendingPermissions: DbPendingPermission[];
}

export function ThinkingIndicator({
  instanceStatus,
  messages,
  pendingPermissions,
}: ThinkingIndicatorProps) {
  const hasStreamingMessage = messages.some(
    (m) => m.role === "assistant" && m.status === "streaming",
  );
  const hasPermission = pendingPermissions.length > 0;

  // Determine display state
  let text: string | null = null;
  let color = "text-hub-text-muted";
  let pulse = false;

  if (hasPermission) {
    text = "Waiting for permission…";
    color = "text-orange-400";
    pulse = true;
  } else if (hasStreamingMessage) {
    text = "Claude is writing";
    color = "text-hub-text-muted";
  } else if (instanceStatus === "running") {
    text = "Claude is thinking";
    color = "text-hub-text-muted";
  } else if (instanceStatus === "queued") {
    text = "Queued — waiting for bridge";
    color = "text-hub-text-muted";
  }

  if (!text) return null;

  return (
    <div className="flex-shrink-0 px-4 py-2">
      <div className="max-w-3xl mx-auto flex items-center gap-2">
        {/* Animated dots */}
        <div className={`flex items-center gap-0.5 ${pulse ? "animate-pulse" : ""}`}>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${color} bg-current animate-bounce`}
            style={{ animationDelay: "0ms", animationDuration: "1s" }}
          />
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${color} bg-current animate-bounce`}
            style={{ animationDelay: "200ms", animationDuration: "1s" }}
          />
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${color} bg-current animate-bounce`}
            style={{ animationDelay: "400ms", animationDuration: "1s" }}
          />
        </div>
        <span className={`text-xs ${color}`}>{text}</span>
      </div>
    </div>
  );
}
