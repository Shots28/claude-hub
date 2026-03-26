"use client";
// ---------------------------------------------------------------------------
// MessageBubble — Single message display
// ---------------------------------------------------------------------------

import { useState } from "react";
import { StreamingText } from "./streaming-text";
import { ToolCallBlock } from "./tool-call-block";
import type { DbMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: DbMessage;
  isStreaming?: boolean;
  isFirstInTurn?: boolean;
}

export function MessageBubble({
  message,
  isStreaming = false,
  isFirstInTurn = false,
}: MessageBubbleProps) {
  const [showCopy, setShowCopy] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isTool = !!message.tool_name;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may not be available
    }
  };

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
      onMouseEnter={() => setShowCopy(true)}
      onMouseLeave={() => setShowCopy(false)}
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
          }`}
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

        {/* Timestamp + copy button */}
        <div
          className={`flex items-center gap-1.5 mt-0.5 ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          <span className="text-[10px] text-hub-text-muted/60">
            {timeStr}
          </span>

          {(showCopy || copied) && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-[10px] text-hub-text-muted/60 hover:text-hub-text-muted transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
