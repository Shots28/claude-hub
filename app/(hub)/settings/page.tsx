"use client";
// ---------------------------------------------------------------------------
// Settings Page — Health stats, session cleanup, about info
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

interface HealthData {
  status: string;
  uptime: number;
  memoryMb: { node: number; total: number; limit: number };
  timestamp: string;
}

interface BridgeStatus {
  online: boolean;
  lastSeen: string | null;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ online: false, lastSeen: null });

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // silently fail
    } finally {
      setHealthLoading(false);
    }
  }, []);

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
    fetchHealth();
    fetchBridgeStatus();
    const interval = setInterval(() => {
      fetchHealth();
      fetchBridgeStatus();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth, fetchBridgeStatus]);

  const handleCleanSessions = async () => {
    setCleaning(true);
    setCleanMessage(null);
    try {
      const res = await fetch("/api/instances/cleanup", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCleanMessage(
          data.message || "Cleanup complete. No old sessions found.",
        );
      } else {
        setCleanMessage("Cleanup endpoint not available yet.");
      }
    } catch {
      setCleanMessage("Failed to run cleanup. Try again later.");
    } finally {
      setCleaning(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

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

        {/* System Health */}
        <section className="mb-6">
          <h2 className="text-xs font-medium text-hub-text-muted uppercase tracking-wider mb-3">
            System Health
          </h2>
          <div className="bg-hub-surface border border-hub-border rounded-xl p-4 space-y-4">
            {healthLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-hub-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-hub-text-muted">
                  Loading health data...
                </span>
              </div>
            ) : health ? (
              <>
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-hub-text-muted">Status</span>
                  <span className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {health.status === "ok" ? "Healthy" : health.status}
                  </span>
                </div>

                {/* Uptime */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-hub-text-muted">Uptime</span>
                  <span className="text-sm font-mono text-hub-text">
                    {formatUptime(health.uptime)}
                  </span>
                </div>

                {/* Memory */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-hub-text-muted">
                      Memory usage
                    </span>
                    <span className="text-sm font-mono text-hub-text">
                      {health.memoryMb.node}MB / {health.memoryMb.limit}MB
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-hub-border overflow-hidden">
                    {(() => {
                      const pct = Math.round(
                        (health.memoryMb.node / health.memoryMb.limit) * 100,
                      );
                      const barColor =
                        pct >= 90
                          ? "bg-red-500"
                          : pct >= 80
                            ? "bg-yellow-500"
                            : "bg-emerald-500";
                      return (
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      );
                    })()}
                  </div>
                </div>

                {/* RSS */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-hub-text-muted">
                    Total RSS
                  </span>
                  <span className="text-sm font-mono text-hub-text">
                    {health.memoryMb.total}MB
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-hub-text-muted">
                Unable to fetch health data
              </p>
            )}
          </div>
        </section>

        {/* Maintenance */}
        <section className="mb-6">
          <h2 className="text-xs font-medium text-hub-text-muted uppercase tracking-wider mb-3">
            Maintenance
          </h2>
          <div className="bg-hub-surface border border-hub-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-hub-text">
                  Clean old sessions
                </p>
                <p className="text-xs text-hub-text-muted mt-0.5">
                  Remove sessions and messages older than 30 days
                </p>
              </div>
              <button
                type="button"
                onClick={handleCleanSessions}
                disabled={cleaning}
                className="px-4 py-2 text-sm font-medium bg-hub-surface-2 hover:bg-hub-border text-hub-text rounded-lg disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50"
              >
                {cleaning ? "Cleaning..." : "Clean"}
              </button>
            </div>
            {cleanMessage && (
              <p className="text-xs text-hub-text-muted mt-3 bg-hub-surface-2 rounded-lg px-3 py-2">
                {cleanMessage}
              </p>
            )}
          </div>
        </section>

        {/* Danger Zone */}
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
