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

interface StatusBadgeProps {
  status: InstanceStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
  errorMessage?: string;
}

export function StatusBadge({
  status,
  showLabel = false,
  size = "sm",
  errorMessage,
}: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.stopped;
  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  const [showError, setShowError] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

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

  return (
    <span
      className={`inline-flex items-center gap-1.5 relative ${hasError ? "cursor-pointer" : ""}`}
      onClick={hasError ? () => setShowError(!showError) : undefined}
    >
      <span
        className={`${dotSize} rounded-full ${config.color} ${
          config.pulse ? "pulse-running" : ""
        }`}
      />
      {showLabel && (
        <span className="text-xs text-hub-text-muted">{config.label}</span>
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
