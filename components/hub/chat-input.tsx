"use client";
// ---------------------------------------------------------------------------
// ChatInput — Text input with send/interrupt toggle
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { InstanceStatus } from "@/lib/types";

type SendStatus = "idle" | "sending" | "sent" | "failed";

interface ChatInputProps {
  onSend: (text: string) => void;
  onInterrupt: () => void;
  instanceStatus: InstanceStatus;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onInterrupt,
  instanceStatus,
  disabled = false,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isRunning = instanceStatus === "running";
  const isQueued = instanceStatus === "queued";
  const canSend = text.trim().length > 0 && !isQueued;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Clean up fade timer on unmount
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const handleSend = () => {
    const trimmed = text.trim().replace(/\0/g, '');
    if (!trimmed || trimmed.length > 50000 || isQueued) return;

    setSendStatus("sending");
    // Clear any existing fade timer
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    try {
      onSend(trimmed);
      setText("");
      // Reset height after clearing
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      setSendStatus("sent");
      fadeTimerRef.current = setTimeout(() => {
        setSendStatus("idle");
      }, 2000);
    } catch {
      setSendStatus("failed");
      fadeTimerRef.current = setTimeout(() => {
        setSendStatus("idle");
      }, 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isRunning) {
        onInterrupt();
      } else {
        handleSend();
      }
    }
  };

  return (
    <div className="border-t border-hub-border bg-hub-bg px-3 py-3 safe-area-bottom">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isQueued
                ? "Queued..."
                : isRunning
                  ? "Press Enter to interrupt, or type a new message..."
                  : "Message Claude..."
            }
            disabled={disabled || isQueued}
            rows={1}
            className="w-full bg-hub-surface-2 border border-hub-border rounded-xl px-4 py-2.5 text-sm text-hub-text placeholder-hub-text-muted/50 resize-none focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50 disabled:opacity-50 transition-colors"
          />
        </div>

        {isRunning ? (
          // Interrupt button (red square)
          <button
            type="button"
            onClick={onInterrupt}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
            aria-label="Interrupt"
          >
            <svg
              className="w-4 h-4 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          // Send button
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-hub-accent hover:bg-hub-accent-hover active:bg-blue-700 disabled:bg-hub-surface-2 disabled:text-hub-text-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50"
            aria-label="Send"
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
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Send status indicator */}
      {sendStatus !== "idle" && (
        <div className="max-w-3xl mx-auto mt-1.5 px-1">
          <span
            className={`text-[11px] transition-opacity duration-500 ${
              sendStatus === "sending"
                ? "text-hub-text-muted"
                : sendStatus === "sent"
                  ? "text-emerald-400"
                  : "text-red-400"
            }`}
          >
            {sendStatus === "sending"
              ? "Sending..."
              : sendStatus === "sent"
                ? "Sent"
                : "Failed to send"}
          </span>
        </div>
      )}
    </div>
  );
}
