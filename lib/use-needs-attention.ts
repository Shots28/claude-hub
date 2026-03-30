"use client";
// ---------------------------------------------------------------------------
// useNeedsAttention — Tracks which instances need user attention
// ---------------------------------------------------------------------------
// Triggers for:
// - Permission requests pending (needs approval)
// - Instance completed (running → idle transition or recent idle)
//
// All badges are red. Dismissed per-instance when the user opens that
// specific chat (currentInstanceId). Viewing the chat list does NOT
// clear anything.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DbInstance, DbPendingPermission } from "@/lib/types";

const DISMISSED_KEY = "hub_dismissed_instances";

/** Returns { instanceId: dismissedAtTimestamp } */
function getDismissed(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    // Prune entries older than 2 hours to avoid unbounded growth
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const cleaned: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed)) {
      if (ts > cutoff) cleaned[id] = ts;
    }
    return cleaned;
  } catch {
    return {};
  }
}

function dismissInstance(instanceId: string): void {
  if (typeof window === "undefined") return;
  try {
    const dismissed = getDismissed();
    dismissed[instanceId] = Date.now();
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {
    // Storage unavailable
  }
}

/** An instance is dismissed if we dismissed it AFTER it was last updated */
function isDismissed(instanceId: string, updatedAt: string): boolean {
  const dismissed = getDismissed();
  const ts = dismissed[instanceId];
  if (!ts) return false;
  return ts >= new Date(updatedAt).getTime();
}

export interface AttentionState {
  /** Instance IDs that need attention */
  needsAttention: Set<string>;
  /** Total count of instances needing attention */
  totalAttention: number;
  /** Check if a specific instance needs attention */
  hasAttention: (instanceId: string) => boolean;
}

export function useNeedsAttention(
  instances: DbInstance[],
  pendingPermissions: DbPendingPermission[],
  currentInstanceId?: string
): AttentionState {
  const prevStatusRef = useRef<Record<string, string>>({});
  // Track instances that had a live running→idle transition this session
  const completedThisSessionRef = useRef<Set<string>>(new Set());

  // Dismiss the instance the user is currently viewing
  useEffect(() => {
    if (!currentInstanceId) return;
    dismissInstance(currentInstanceId);
    completedThisSessionRef.current.delete(currentInstanceId);
  }, [currentInstanceId]);

  const needsAttention = useMemo(() => {
    const attention = new Set<string>();

    for (const inst of instances) {
      // Skip the instance we're currently viewing — it's being dismissed
      if (inst.id === currentInstanceId) continue;

      // 1. Pending permissions (always show, regardless of dismissed state)
      const hasPermission = pendingPermissions.some(
        (p) => p.instance_id === inst.id && p.status === "pending"
      );
      if (hasPermission) {
        attention.add(inst.id);
        continue;
      }

      // 2. Live running → idle transition
      const prevStatus = prevStatusRef.current[inst.id];
      if (prevStatus === "running" && inst.status === "idle") {
        if (!isDismissed(inst.id, inst.updated_at)) {
          completedThisSessionRef.current.add(inst.id);
        }
      }

      // 3. Missed completions on first load (no prevStatus = first render)
      if (inst.status === "idle" && inst.updated_at && !prevStatus) {
        const updatedAt = new Date(inst.updated_at).getTime();
        const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
        if (updatedAt > thirtyMinAgo && !isDismissed(inst.id, inst.updated_at)) {
          completedThisSessionRef.current.add(inst.id);
        }
      }

      // Add if completed and not yet dismissed
      if (completedThisSessionRef.current.has(inst.id)) {
        attention.add(inst.id);
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

  const hasAttention = useCallback(
    (instanceId: string) => needsAttention.has(instanceId),
    [needsAttention]
  );

  return { needsAttention, totalAttention, hasAttention };
}
