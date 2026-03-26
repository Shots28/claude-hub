"use client";
// ---------------------------------------------------------------------------
// useBridgeStatus — Polls bridge heartbeat, shows green/yellow/red status
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

export type BridgeHealth = "connected" | "slow" | "offline" | "unknown";

interface BridgeStatusState {
  health: BridgeHealth;
  lastHeartbeat: string | null;
}

export function useBridgeStatus(): BridgeStatusState {
  const [state, setState] = useState<BridgeStatusState>({
    health: "unknown",
    lastHeartbeat: null,
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async () => {
    // Skip if tab is hidden (battery/performance guard)
    if (document.hidden) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5_000);

      const res = await fetch("/api/bridge/status", {
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const lastHeartbeat = data.lastHeartbeat;

        if (!lastHeartbeat) {
          setState({ health: "offline", lastHeartbeat: null });
          return;
        }

        const age = Date.now() - new Date(lastHeartbeat).getTime();
        let health: BridgeHealth;
        if (age < 15_000) {
          health = "connected";
        } else if (age < 30_000) {
          health = "slow";
        } else {
          health = "offline";
        }

        setState({ health, lastHeartbeat });
      } else {
        setState((prev) => ({ ...prev, health: "unknown" }));
      }
    } catch {
      // Network error — don't change state aggressively
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkStatus();

    // Poll every 15 seconds
    intervalRef.current = setInterval(checkStatus, 15_000);

    // Also check on visibility change (app comes to foreground)
    const handleVisibility = () => {
      if (!document.hidden) checkStatus();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkStatus]);

  return state;
}
