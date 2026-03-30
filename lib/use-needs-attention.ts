"use client";
// ---------------------------------------------------------------------------
// useNeedsAttention — Tracks which instances need user attention
// ---------------------------------------------------------------------------
// Only triggers for permission requests (the only truly actionable state).
// Completions (running → idle) are NOT tracked — they're visible from the
// status badge and don't require user action.
//
// The nav badge clears when the user opens the /chats page (markAllSeen).
// Individual items clear when the permission is resolved.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DbInstance, DbPendingPermission } from "@/lib/types";

const SEEN_KEY = "hub_seen_attention";

function getSeenTimestamp(): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(localStorage.getItem(SEEN_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function setSeenTimestamp(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // Storage unavailable
  }
}

export interface AttentionState {
  /** Instance IDs that need attention (only permissions) */
  needsAttention: Set<string>;
  /** Total count of instances needing attention */
  totalAttention: number;
  /** Mark all current attention items as seen (clears the nav badge) */
  markAllSeen: () => void;
  /** Check if a specific instance needs attention */
  hasAttention: (instanceId: string) => boolean;
}

export function useNeedsAttention(
  instances: DbInstance[],
  pendingPermissions: DbPendingPermission[],
  currentInstanceId?: string
): AttentionState {
  const seenAtRef = useRef<number>(getSeenTimestamp());

  // Only permissions count as attention — they require user action
  const needsAttention = useMemo(() => {
    const attention = new Set<string>();

    for (const perm of pendingPermissions) {
      if (perm.status !== "pending") continue;
      // Skip the instance we're currently viewing
      if (perm.instance_id === currentInstanceId) continue;
      // Skip if the permission was created before the user last looked
      const requestedAt = new Date(perm.requested_at).getTime();
      if (requestedAt <= seenAtRef.current) continue;

      attention.add(perm.instance_id);
    }

    return attention;
  }, [pendingPermissions, currentInstanceId]);

  const totalAttention = needsAttention.size;

  // Update app badge
  useEffect(() => {
    if (totalAttention > 0) {
      (navigator as any).setAppBadge?.(totalAttention).catch(() => {});
    } else {
      (navigator as any).clearAppBadge?.().catch(() => {});
    }
  }, [totalAttention]);

  // Auto-clear when viewing the instance with a pending permission
  useEffect(() => {
    if (!currentInstanceId) return;
    if (needsAttention.has(currentInstanceId)) {
      // Permission will be resolved via the permission banner, no manual dismiss needed
    }
  }, [currentInstanceId, needsAttention]);

  const markAllSeen = useCallback(() => {
    seenAtRef.current = Date.now();
    setSeenTimestamp();
  }, []);

  const hasAttention = useCallback(
    (instanceId: string) => needsAttention.has(instanceId),
    [needsAttention]
  );

  return { needsAttention, totalAttention, markAllSeen, hasAttention };
}
