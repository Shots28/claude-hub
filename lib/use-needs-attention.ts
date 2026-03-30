"use client";
// ---------------------------------------------------------------------------
// useNeedsAttention — Tracks which instances need user attention
// ---------------------------------------------------------------------------
// Triggers for:
// - Permission requests pending (needs approval)
// - Instance completed (running → idle transition or recent idle)
//
// All badges are red. Auto-dismiss when user opens /chats.
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
  /** Instance IDs that need attention */
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
  const prevStatusRef = useRef<Record<string, string>>({});

  const needsAttention = useMemo(() => {
    const attention = new Set<string>();

    for (const inst of instances) {
      // Skip the instance we're currently viewing
      if (inst.id === currentInstanceId) continue;

      // 1. Pending permissions
      const hasPermission = pendingPermissions.some(
        (p) => p.instance_id === inst.id && p.status === "pending"
      );
      if (hasPermission) {
        attention.add(inst.id);
        continue;
      }

      // 2. Completions: live running → idle transition
      const prevStatus = prevStatusRef.current[inst.id];
      if (prevStatus === "running" && inst.status === "idle") {
        const updatedAt = new Date(inst.updated_at).getTime();
        if (updatedAt > seenAtRef.current) {
          attention.add(inst.id);
          continue;
        }
      }

      // 3. Missed completions: idle + recently updated + not yet seen
      if (inst.status === "idle" && inst.updated_at && !prevStatus) {
        const updatedAt = new Date(inst.updated_at).getTime();
        const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
        if (updatedAt > thirtyMinAgo && updatedAt > seenAtRef.current) {
          attention.add(inst.id);
        }
      }
    }

    // Update previous status tracking
    const newStatus: Record<string, string> = {};
    for (const inst of instances) {
      newStatus[inst.id] = inst.status;
    }
    prevStatusRef.current = newStatus;

    return attention;
  }, [instances, pendingPermissions, currentInstanceId]);

  const totalAttention = needsAttention.size;

  // Update app badge
  useEffect(() => {
    if (totalAttention > 0) {
      (navigator as any).setAppBadge?.(totalAttention).catch(() => {});
    } else {
      (navigator as any).clearAppBadge?.().catch(() => {});
    }
  }, [totalAttention]);

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
