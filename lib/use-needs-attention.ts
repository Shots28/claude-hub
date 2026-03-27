"use client";
// ---------------------------------------------------------------------------
// useNeedsAttention — Tracks which instances need user attention
// ---------------------------------------------------------------------------
// Only triggers notifications for actionable states:
// - Agent completed (went from running → idle)
// - Permission request pending
//
// Does NOT trigger for "running" state (agent is writing)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DbInstance, DbPendingPermission } from "@/lib/types";

const SEEN_COMPLETIONS_KEY = "hub_seen_completions_";

function getSeenCompletions(instanceId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(`${SEEN_COMPLETIONS_KEY}${instanceId}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markCompletionSeen(instanceId: string, timestamp: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = getSeenCompletions(instanceId);
    seen.add(timestamp);
    // Keep only last 50 entries to avoid localStorage bloat
    const arr = Array.from(seen).slice(-50);
    localStorage.setItem(`${SEEN_COMPLETIONS_KEY}${instanceId}`, JSON.stringify(arr));
  } catch {
    // Storage unavailable
  }
}

export interface AttentionState {
  /** Instances that need attention (permission pending or just completed) */
  needsAttention: Record<string, "permission" | "completed">;
  /** Total count of instances needing attention */
  totalAttention: number;
  /** Mark an instance as seen/acknowledged */
  markSeen: (instanceId: string) => void;
  /** Check if a specific instance needs attention */
  hasAttention: (instanceId: string) => boolean;
}

export function useNeedsAttention(
  instances: DbInstance[],
  pendingPermissions: DbPendingPermission[],
  currentInstanceId?: string
): AttentionState {
  // Track previous status to detect running → idle transitions
  const prevStatusRef = useRef<Record<string, string>>({});
  const completedInstancesRef = useRef<Set<string>>(new Set());

  // Compute which instances need attention
  const needsAttention = useMemo(() => {
    const attention: Record<string, "permission" | "completed"> = {};

    for (const inst of instances) {
      // Skip the instance we're currently viewing
      if (inst.id === currentInstanceId) continue;

      // Check for pending permissions
      const hasPermission = pendingPermissions.some(
        (p) => p.instance_id === inst.id && p.status === "pending"
      );
      if (hasPermission) {
        attention[inst.id] = "permission";
        continue;
      }

      // Check if instance just completed (was running, now idle)
      const prevStatus = prevStatusRef.current[inst.id];
      if (prevStatus === "running" && inst.status === "idle") {
        // Check if we've already seen this completion
        const seenTimestamp = inst.updated_at;
        const seen = getSeenCompletions(inst.id);
        if (!seen.has(seenTimestamp)) {
          completedInstancesRef.current.add(inst.id);
        }
      }

      // Mark as needing attention if just completed
      if (completedInstancesRef.current.has(inst.id)) {
        attention[inst.id] = "completed";
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

  const totalAttention = Object.keys(needsAttention).length;

  // Send push notification when attention changes
  useEffect(() => {
    const attentionList = Object.entries(needsAttention);
    if (attentionList.length === 0) return;

    // Only notify if document is hidden (user not looking at app)
    if (typeof document !== "undefined" && !document.hidden) return;

    for (const [instanceId, type] of attentionList) {
      const inst = instances.find((i) => i.id === instanceId);
      if (!inst) continue;

      // Show browser notification
      showBrowserNotification(inst.name, type);
    }
  }, [needsAttention, instances]);

  // Update app badge
  useEffect(() => {
    if (totalAttention > 0) {
      (navigator as any).setAppBadge?.(totalAttention).catch(() => {});
    } else {
      (navigator as any).clearAppBadge?.().catch(() => {});
    }
  }, [totalAttention]);

  // Clear attention when viewing an instance
  useEffect(() => {
    if (!currentInstanceId) return;

    // Mark completion as seen when viewing
    const inst = instances.find((i) => i.id === currentInstanceId);
    if (inst && completedInstancesRef.current.has(currentInstanceId)) {
      markCompletionSeen(currentInstanceId, inst.updated_at);
      completedInstancesRef.current.delete(currentInstanceId);
    }
  }, [currentInstanceId, instances]);

  const markSeen = useCallback((instanceId: string) => {
    const inst = instances.find((i) => i.id === instanceId);
    if (inst) {
      markCompletionSeen(instanceId, inst.updated_at);
      completedInstancesRef.current.delete(instanceId);
    }
  }, [instances]);

  const hasAttention = useCallback(
    (instanceId: string) => !!needsAttention[instanceId],
    [needsAttention]
  );

  return { needsAttention, totalAttention, markSeen, hasAttention };
}

// Show browser notification (when tab is hidden)
function showBrowserNotification(
  instanceName: string,
  type: "permission" | "completed"
): void {
  // Only show if we have permission and document is hidden
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;

  const title = type === "permission"
    ? "Permission Required"
    : "Task Complete";
  const body = type === "permission"
    ? `${instanceName} is waiting for your approval`
    : `${instanceName} has finished`;

  try {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      tag: `hub-${type}`, // Prevents duplicate notifications
    });
  } catch {
    // Notifications may not be available
  }
}
