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

const DISMISSED_KEY = "hub_dismissed_completions";

/** Returns { instanceId: dismissedAtTimestamp } */
function getDismissedCompletions(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, number>;
    // Clean up entries older than 1 hour
    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [id, time] of Object.entries(parsed)) {
      if (now - time < 60 * 60 * 1000) cleaned[id] = time;
    }
    return cleaned;
  } catch {
    return {};
  }
}

function dismissCompletion(instanceId: string): void {
  if (typeof window === "undefined") return;
  try {
    const dismissed = getDismissedCompletions();
    dismissed[instanceId] = Date.now();
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {
    // Storage unavailable
  }
}

/** A completion is dismissed if we dismissed it AFTER the instance was last updated */
function isCompletionDismissed(instanceId: string, updatedAt: string): boolean {
  const dismissed = getDismissedCompletions();
  const dismissedAt = dismissed[instanceId];
  if (!dismissedAt) return false;
  return dismissedAt >= new Date(updatedAt).getTime();
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
        // Live transition detected
        if (!isCompletionDismissed(inst.id, inst.updated_at)) {
          completedInstancesRef.current.add(inst.id);
        }
      }

      // Also detect missed completions (app opened after Claude finished)
      // If idle, updated recently (within 30 min), and not yet dismissed
      if (inst.status === "idle" && inst.updated_at && !prevStatus) {
        const updatedAt = new Date(inst.updated_at).getTime();
        const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
        if (updatedAt > thirtyMinAgo) {
          if (!isCompletionDismissed(inst.id, inst.updated_at)) {
            completedInstancesRef.current.add(inst.id);
          }
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

    // Mark completion as dismissed when viewing
    if (completedInstancesRef.current.has(currentInstanceId)) {
      dismissCompletion(currentInstanceId);
      completedInstancesRef.current.delete(currentInstanceId);
    }
  }, [currentInstanceId, instances]);

  const markSeen = useCallback((instanceId: string) => {
    dismissCompletion(instanceId);
    completedInstancesRef.current.delete(instanceId);
  }, []);

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
