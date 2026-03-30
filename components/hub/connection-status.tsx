"use client";
// ---------------------------------------------------------------------------
// ConnectionStatus — Unified connectivity indicator
// ---------------------------------------------------------------------------
// Shows the WORST current state as a small banner at the top of the hub layout.
// Hidden when everything is healthy.
// Priority: offline > bridge offline > realtime disconnected
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback } from "react";
import { useBridgeStatus } from "@/lib/use-bridge-status";
import { useHubRealtime } from "@/lib/hub-context";

type ConnectivityState = "healthy" | "realtime_disconnected" | "bridge_offline" | "offline";

export function ConnectionStatus() {
  const bridgeStatus = useBridgeStatus();
  const realtime = useHubRealtime();
  const [isOnline, setIsOnline] = useState(true);
  const [restarting, setRestarting] = useState(false);

  // Track navigator.onLine
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Determine worst state
  const state: ConnectivityState = !isOnline
    ? "offline"
    : bridgeStatus.health === "offline"
    ? "bridge_offline"
    : !realtime.connected
    ? "realtime_disconnected"
    : "healthy";

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await fetch("/api/bridge/restart", { method: "POST", credentials: "include" });
      // Wait for bridge to restart (poll will detect it)
      setTimeout(() => setRestarting(false), 15_000);
    } catch {
      setRestarting(false);
    }
  }, []);

  if (state === "healthy") return null;

  const config = {
    offline: {
      bg: "bg-red-500/15 border-red-500/30",
      text: "text-red-400",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M12 9v4m0 4h.01" />
        </svg>
      ),
      message: "Offline — messages won't send",
      showRestart: false,
    },
    bridge_offline: {
      bg: "bg-amber-500/15 border-amber-500/30",
      text: "text-amber-400",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
      message: "Bridge offline — messages queued",
      showRestart: true,
    },
    realtime_disconnected: {
      bg: "bg-yellow-500/10 border-yellow-500/20",
      text: "text-yellow-500/80",
      icon: (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
      ),
      message: "Reconnecting...",
      showRestart: false,
    },
  } as const;

  const c = config[state];

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 border-b ${c.bg} ${c.text} text-xs font-medium`}>
      <div className="flex items-center gap-2">
        {c.icon}
        <span>{c.message}</span>
      </div>
      {c.showRestart && (
        <button
          type="button"
          onClick={handleRestart}
          disabled={restarting}
          className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {restarting ? "Restarting..." : "Restart"}
        </button>
      )}
    </div>
  );
}
