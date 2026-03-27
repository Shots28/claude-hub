"use client";
// ---------------------------------------------------------------------------
// MessageBubble — Single message display
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import { StreamingText } from "./streaming-text";
import { ToolCallBlock } from "./tool-call-block";
import type { UiMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: UiMessage;
  isStreaming?: boolean;
  isFirstInTurn?: boolean;
  onRetry?: (optimisticId: string) => void;
  onViewPlan?: (planPath: string) => void;
}

export function MessageBubble({
  message,
  isStreaming = false,
  isFirstInTurn = false,
  onRetry,
  onViewPlan,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isTool = !!message.tool_name;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API may not be available
    }
  }, [message.content]);

  // Tool call blocks are rendered inline with better spacing
  if (isTool) {
    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(message.content);
    } catch {
      // content might be plain output text
    }

    return (
      <div className="px-4 py-2">
        <ToolCallBlock
          toolName={message.tool_name!}
          toolId={message.tool_id ?? ""}
          input={typeof parsedInput === "object" ? parsedInput : undefined}
          output={message.content}
          isError={message.is_error}
          onViewPlan={onViewPlan}
        />
      </div>
    );
  }

  // System messages
  if (isSystem) {
    return (
      <div className="px-4 py-1">
        <div className="text-xs text-hub-text-muted italic text-center">
          {message.content}
        </div>
      </div>
    );
  }

  // Format timestamp
  const timestamp = new Date(message.created_at);
  const timeStr = timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Add extra top margin for first message in a new turn (except user messages)
  const turnSpacing = isFirstInTurn && !isUser ? "mt-2" : "";

  return (
    <div
      className={`px-4 py-2 flex ${isUser ? "justify-end" : "justify-start"} ${turnSpacing}`}
    >
      <div
        className={`relative max-w-[85%] md:max-w-[70%] group ${
          isUser ? "order-1" : "order-1"
        }`}
      >
        <div
          className={`rounded-2xl px-4 py-2.5 ${
            isUser
              ? "bg-blue-600 text-white rounded-br-md"
              : "bg-hub-surface-2 text-hub-text rounded-bl-md"
          } ${message.deliveryStatus === "pending" ? "animate-pulse-slow" : ""}`}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          ) : (
            <StreamingText
              content={message.content}
              isStreaming={isStreaming}
            />
          )}
        </div>

        {/* Timestamp + delivery status + copy */}
        <div
          className={`flex items-center gap-1.5 mt-0.5 ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          <span className="text-[10px] text-hub-text-muted/60">
            {timeStr}
          </span>

          {/* Delivery status for user messages */}
          {isUser && message.deliveryStatus === "pending" && (
            <svg className="w-3 h-3 text-hub-text-muted/50 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          )}
          {isUser && message.deliveryStatus === "delivered" && (
            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isUser && message.deliveryStatus === "failed" && (
            <button
              type="button"
              onClick={() => onRetry?.(message.id)}
              className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Tap to retry
            </button>
          )}

          {/* Copy button - subtle icon */}
          <button
            type="button"
            onClick={handleCopy}
            className={`p-0.5 rounded transition-colors ${
              copied
                ? "text-emerald-400"
                : "text-hub-text-muted/30 hover:text-hub-text-muted/60 active:text-hub-text-muted"
            }`}
            title={copied ? "Copied!" : "Copy"}
          >
            {copied ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
