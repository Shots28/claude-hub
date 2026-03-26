"use client";
// ---------------------------------------------------------------------------
// useUnreadCount — Tracks unread messages per instance using localStorage
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { UiMessage } from "@/lib/types";

const STORAGE_PREFIX = "hub_unread_";

function getLastReadId(instanceId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${instanceId}`);
  } catch {
    return null;
  }
}

function setLastReadId(instanceId: string, messageId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${instanceId}`, messageId);
  } catch {
    // localStorage may be full or unavailable
  }
}

/**
 * Returns the latest non-optimistic message ID for each instance.
 * Optimistic messages (prefixed with "optimistic-") are excluded because
 * they haven't been confirmed yet.
 */
function getLatestMessagePerInstance(
  messages: UiMessage[]
): Record<string, { id: string; index: number }> {
  const latest: Record<string, { id: string; index: number }> = {};

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.id.startsWith("optimistic-")) continue;
    const existing = latest[msg.instance_id];
    if (
      !existing ||
      new Date(msg.created_at).getTime() >
        new Date(messages[existing.index].created_at).getTime()
    ) {
      latest[msg.instance_id] = { id: msg.id, index: i };
    }
  }

  return latest;
}

export interface UnreadState {
  /** Unread count per instance ID */
  unreadCounts: Record<string, number>;
  /** Total unread across all instances */
  totalUnread: number;
  /** Mark an instance as read (stores the latest message ID) */
  markAsRead: (instanceId: string) => void;
}

export function useUnreadCount(
  messages: UiMessage[],
  currentInstanceId?: string
): UnreadState {
  const prevTotalRef = useRef<number>(0);

  // Compute unread counts by comparing latest message ID against stored lastReadId
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    // Group messages by instance
    const byInstance: Record<string, UiMessage[]> = {};
    for (const msg of messages) {
      if (msg.id.startsWith("optimistic-")) continue;
      if (!byInstance[msg.instance_id]) byInstance[msg.instance_id] = [];
      byInstance[msg.instance_id].push(msg);
    }

    for (const [instanceId, instanceMessages] of Object.entries(byInstance)) {
      const lastReadId = getLastReadId(instanceId);
      if (!lastReadId) {
        // No read marker means all messages are "unread" — but to avoid
        // showing a huge badge on first visit, treat no marker as read
        counts[instanceId] = 0;
        continue;
      }

      // Sort by created_at ascending
      const sorted = [...instanceMessages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Find the index of the last read message
      const lastReadIndex = sorted.findIndex((m) => m.id === lastReadId);
      if (lastReadIndex === -1) {
        // Last read message not found in current messages — all are unread
        counts[instanceId] = sorted.length;
      } else {
        // Count messages after the last read one
        counts[instanceId] = sorted.length - lastReadIndex - 1;
      }
    }

    return counts;
  }, [messages]);

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((sum, n) => sum + n, 0),
    [unreadCounts]
  );

  // Auto-mark current instance as read
  useEffect(() => {
    if (!currentInstanceId) return;
    const latestPerInstance = getLatestMessagePerInstance(messages);
    const latest = latestPerInstance[currentInstanceId];
    if (latest) {
      setLastReadId(currentInstanceId, latest.id);
    }
  }, [currentInstanceId, messages]);

  // Update app badge when totalUnread changes
  useEffect(() => {
    if (prevTotalRef.current !== totalUnread) {
      prevTotalRef.current = totalUnread;
      if (totalUnread > 0) {
        (navigator as unknown as { setAppBadge?: (n: number) => Promise<void> })
          .setAppBadge?.(totalUnread)
          .catch(() => {});
      } else {
        (navigator as unknown as { clearAppBadge?: () => Promise<void> })
          .clearAppBadge?.()
          .catch(() => {});
      }
    }
  }, [totalUnread]);

  const markAsRead = useCallback(
    (instanceId: string) => {
      const latestPerInstance = getLatestMessagePerInstance(messages);
      const latest = latestPerInstance[instanceId];
      if (latest) {
        setLastReadId(instanceId, latest.id);
      }
    },
    [messages]
  );

  return { unreadCounts, totalUnread, markAsRead };
}
