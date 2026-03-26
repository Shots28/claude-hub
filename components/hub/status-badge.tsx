"use client";
// ---------------------------------------------------------------------------
// StatusBadge — Colored indicator for instance status
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect } from "react";
import type { InstanceStatus } from "@/lib/types";

const statusConfig: Record<
  InstanceStatus,
  { color: string; label: string; pulse: boolean }
> = {
  idle: { color: "bg-emerald-500", label: "Idle", pulse: false },
  running: { color: "bg-blue-500", label: "Running", pulse: true },
  queued: { color: "bg-yellow-500", label: "Queued", pulse: false },
  error: { color: "bg-red-500", label: "Error", pulse: false },
  stopped: { color: "bg-neutral-500", label: "Stopped", pulse: false },
};

/** Format a relative timestamp like "3m ago", "2h ago", "1d ago" */
function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface StatusBadgeProps {
  status: InstanceStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
  errorMessage?: string;
  /** When true, shows "Waiting for permission" with orange pulsing badge */
  hasPermission?: boolean;
  /** ISO-8601 timestamp for relative time display (e.g. "3m ago") */
  lastActivityAt?: string;
}

export function StatusBadge({
  status,
  showLabel = false,
  size = "sm",
  errorMessage,
  hasPermission = false,
  lastActivityAt,
}: StatusBadgeProps) {
  // "Waiting for permission" overrides the normal status display
  const effectiveConfig = hasPermission
    ? { color: "bg-orange-500", label: "Waiting for permission", pulse: true }
    : statusConfig[status] ?? statusConfig.stopped;

  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  const [showError, setShowError] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Force re-render every 30s so relative timestamps stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastActivityAt) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastActivityAt]);

  const hasError = status === "error" && !!errorMessage;

  useEffect(() => {
    if (!showError) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowError(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showError]);

  // Build the label text, appending relative time when available
  let labelText = effectiveConfig.label;
  if (
    showLabel &&
    lastActivityAt &&
    !hasPermission &&
    (status === "idle" || status === "stopped" || status === "error")
  ) {
    labelText = `${effectiveConfig.label} ${formatRelativeTime(lastActivityAt)}`;
  }

  // Use a distinct pulsing animation class for the permission state
  const pulseClass = hasPermission
    ? "pulse-permission"
    : effectiveConfig.pulse
      ? "pulse-running"
      : "";

  return (
    <span
      className={`inline-flex items-center gap-1.5 relative ${hasError ? "cursor-pointer" : ""}`}
      onClick={hasError ? () => setShowError(!showError) : undefined}
    >
      <span
        className={`${dotSize} rounded-full ${effectiveConfig.color} ${pulseClass}`}
      />
      {showLabel && (
        <span className="text-xs text-hub-text-muted">{labelText}</span>
      )}

      {/* Error tooltip popup */}
      {showError && hasError && (
        <div
          ref={popupRef}
          className="absolute left-0 top-full mt-1.5 z-50 w-64 bg-hub-surface-2 border border-red-500/30 rounded-lg shadow-lg p-3"
        >
          <p className="text-[11px] font-medium text-red-400 mb-1">Error Details</p>
          <p className="text-[11px] text-hub-text-muted leading-relaxed break-words">
            {errorMessage}
          </p>
        </div>
      )}
    </span>
  );
}
