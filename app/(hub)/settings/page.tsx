"use client";
// ---------------------------------------------------------------------------
// Settings Page — Bridge status, session, about info
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

interface BridgeStatus {
  online: boolean;
  lastSeen: string | null;
}

export default function SettingsPage() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ online: false, lastSeen: null });

  const fetchBridgeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bridge/status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setBridgeStatus({
          online: data.online ?? false,
          lastSeen: data.lastHeartbeat ?? null,
        });
      } else {
        setBridgeStatus({ online: false, lastSeen: null });
      }
    } catch {
      setBridgeStatus({ online: false, lastSeen: null });
    }
  }, []);

  useEffect(() => {
    fetchBridgeStatus();
    const interval = setInterval(() => {
      fetchBridgeStatus();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchBridgeStatus]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <h1 className="text-lg font-semibold text-hub-text mb-6">Settings</h1>

        {/* Bridge Status */}
        <section className="mb-6">
          <h2 className="text-xs font-medium text-hub-text-muted uppercase tracking-wider mb-3">
            Bridge Status
          </h2>
          <div className="bg-hub-surface border border-hub-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-hub-text-muted">Local Bridge</span>
              <span className={`text-sm font-medium flex items-center gap-1.5 ${bridgeStatus.online ? "text-emerald-400" : "text-red-400"}`}>
                <span className={`w-2 h-2 rounded-full ${bridgeStatus.online ? "bg-emerald-500" : "bg-red-500"}`} />
                {bridgeStatus.online ? "Online" : "Offline"}
              </span>
            </div>
            {bridgeStatus.lastSeen && (
              <p className="text-xs text-hub-text-muted mt-2">
                Last seen: {new Date(bridgeStatus.lastSeen).toLocaleString()}
              </p>
            )}
            {!bridgeStatus.online && (
              <p className="text-xs text-hub-text-muted mt-2">
                Bridge must be running locally for messages to be processed.
              </p>
            )}
          </div>
        </section>

        {/* Session */}
        <section className="mb-6">
          <h2 className="text-xs font-medium text-hub-text-muted uppercase tracking-wider mb-3">
            Session
          </h2>
          <div className="bg-hub-surface border border-hub-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-hub-text">Sign out</p>
                <p className="text-xs text-hub-text-muted mt-0.5">
                  Clear your session cookie and return to login
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await fetch("/api/auth/logout", {
                      method: "POST",
                      credentials: "include",
                    });
                  } catch {
                    // Best-effort logout
                  }
                  // Clear cookie client-side and redirect
                  document.cookie =
                    "hub_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                  window.location.href = "/login";
                }}
                className="px-4 py-2 text-sm font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="text-xs font-medium text-hub-text-muted uppercase tracking-wider mb-3">
            About
          </h2>
          <div className="bg-hub-surface border border-hub-border rounded-xl p-4">
            <p className="text-sm text-hub-text">Claude Hub v0.1.0</p>
            <p className="text-xs text-hub-text-muted mt-1">
              Mobile control center for Claude Code instances
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
