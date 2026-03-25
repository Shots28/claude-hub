"use client";
// ---------------------------------------------------------------------------
// MessageList — Scrollable list of messages with auto-scroll
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import type { DbMessage } from "@/lib/types";

interface MessageListProps {
  messages: DbMessage[];
  streamingMessageId?: string | null;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  // Reset times to midnight for comparison
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateDay.getTime() === today.getTime()) return "Today";
  if (dateDay.getTime() === yesterday.getTime()) return "Yesterday";

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function getDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 h-px bg-hub-border" />
      <span className="text-[11px] font-medium text-hub-text-muted/60 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 h-px bg-hub-border" />
    </div>
  );
}

export function MessageList({
  messages,
  streamingMessageId,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAutoScroll = useRef(true);

  // Check if user has scrolled up
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isAutoScroll.current = atBottom;
  };

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (isAutoScroll.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (messages.length === 0) {
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
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
          </div>
          <p className="text-sm text-hub-text-muted">
            No messages yet. Send a message to get started.
          </p>
        </div>
      </div>
    );
  }

  // Build message list with date separators
  const elements: React.ReactNode[] = [];
  let lastDateKey = "";

  for (const msg of messages) {
    const dateKey = getDateKey(msg.created_at);
    if (dateKey !== lastDateKey) {
      elements.push(
        <DateSeparator
          key={`date-${dateKey}`}
          label={formatDateSeparator(msg.created_at)}
        />
      );
      lastDateKey = dateKey;
    }
    elements.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isStreaming={msg.id === streamingMessageId}
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto scroll-smooth-chat scrollbar-hide py-4 space-y-1"
    >
      {elements}
      <div ref={bottomRef} />
    </div>
  );
}
