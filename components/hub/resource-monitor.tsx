"use client";
// ---------------------------------------------------------------------------
// ResourceMonitor — Sidebar footer widget showing RAM and active queries
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

interface HealthData {
  memoryMb: { node: number; total: number; limit: number };
  uptime: number;
}

export function ResourceMonitor() {
  const [health, setHealth] = useState<HealthData | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (!health) return null;

  const usedPct = Math.round(
    (health.memoryMb.node / health.memoryMb.limit) * 100,
  );
  const barColor =
    usedPct >= 90
      ? "bg-red-500"
      : usedPct >= 80
        ? "bg-yellow-500"
        : "bg-emerald-500";

  const uptimeMin = Math.floor(health.uptime / 60);
  const uptimeHr = Math.floor(uptimeMin / 60);
  const uptimeStr =
    uptimeHr > 0
      ? `${uptimeHr}h ${uptimeMin % 60}m`
      : `${uptimeMin}m`;

  return (
    <div className="px-3 py-2 border-t border-hub-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-hub-text-muted uppercase tracking-wider">
          Memory
        </span>
        <span className="text-[10px] text-hub-text-muted">
          {health.memoryMb.node}MB / {health.memoryMb.limit}MB
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-hub-border overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(usedPct, 100)}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-hub-text-muted">
        Uptime: {uptimeStr}
      </div>
    </div>
  );
}
