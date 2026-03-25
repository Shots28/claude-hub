"use client";
// ---------------------------------------------------------------------------
// StatusBadge — Colored indicator for instance status
// ---------------------------------------------------------------------------

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
}

export function StatusBadge({
  status,
  showLabel = false,
  size = "sm",
}: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.stopped;
  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`${dotSize} rounded-full ${config.color} ${
          config.pulse ? "pulse-running" : ""
        }`}
      />
      {showLabel && (
        <span className="text-xs text-hub-text-muted">{config.label}</span>
      )}
    </span>
  );
}
