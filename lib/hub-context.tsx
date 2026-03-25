"use client";
// ---------------------------------------------------------------------------
// Claude Hub — Realtime Context Provider
// ---------------------------------------------------------------------------
// Shared context so child pages can access realtime state without prop drilling.
// The hub layout wraps children in <HubRealtimeProvider>.
// Pages import useHubRealtime() from this module.
// ---------------------------------------------------------------------------

import { createContext, useContext, type ReactNode } from "react";
import { useRealtime, type RealtimeState } from "@/lib/use-realtime";

const RealtimeContext = createContext<RealtimeState | null>(null);

export function useHubRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useHubRealtime must be used within HubRealtimeProvider");
  }
  return ctx;
}

export function HubRealtimeProvider({ children }: { children: ReactNode }) {
  const realtime = useRealtime();

  return (
    <RealtimeContext.Provider value={realtime}>
      {children}
    </RealtimeContext.Provider>
  );
}
