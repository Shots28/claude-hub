"use client";

export const dynamic = "force-dynamic";
// ---------------------------------------------------------------------------
// Settings Page — Bridge status, session, about info
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { requestPushPermission, resubscribePush, isPushDenied } from "@/lib/push-client";

interface BridgeStatus {
  online: boolean;
  lastSeen: string | null;
}

type RestartState = "idle" | "requesting" | "requested" | "error";

export default function SettingsPage() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ online: false, lastSeen: null });
  const [restartState, setRestartState] = useState<RestartState>("idle");
  const [pushState, setPushState] = useState<"unknown" | "granted" | "denied" | "unsupported" | "subscribing">("unknown");

  // Check notification permission on mount
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushState("unsupported");
    } else if (Notification.permission === "granted") {
      setPushState("granted");
    } else if (Notification.permission === "denied" || isPushDenied()) {
      setPushState("denied");
    }
  }, []);

  const handleEnablePush = async () => {
    setPushState("subscribing");
    const success = await requestPushPermission();
    setPushState(success ? "granted" : "denied");
  };

  const handleResubscribe = async () => {
    setPushState("subscribing");
    const success = await resubscribePush();
    setPushState(success ? "granted" : "denied");
  };

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

  const handleRestart = async () => {
    setRestartState("requesting");
    try {
      const res = await fetch("/api/bridge/restart", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setRestartState("requested");
        // Poll for bridge to come back online
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          await fetchBridgeStatus();
          if (attempts > 30) {
            clearInterval(poll);
            setRestartState("error");
          }
        }, 2000);
        // Watch for bridge to go offline then come back
        const waitForRestart = setInterval(async () => {
          const r = await fetch("/api/bridge/status", { credentials: "include" }).catch(() => null);
          if (r?.ok) {
            const data = await r.json();
            if (data.online) {
              clearInterval(poll);
              clearInterval(waitForRestart);
              setRestartState("idle");
              setBridgeStatus({ online: true, lastSeen: data.lastHeartbeat });
            }
          }
        }, 3000);
        // Timeout after 60s
        setTimeout(() => {
          clearInterval(poll);
          clearInterval(waitForRestart);
          if (restartState === "requested") setRestartState("idle");
        }, 60_000);
      } else {
        setRestartState("error");
        setTimeout(() => setRestartState("idle"), 3000);
      }
    } catch {
      setRestartState("error");
      setTimeout(() => setRestartState("idle"), 3000);
    }
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
            <div className="mt-3 pt-3 border-t border-hub-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-hub-text">Restart Bridge</p>
                  <p className="text-xs text-hub-text-muted mt-0.5">
                    Remotely restart the bridge process
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRestart}
                  disabled={restartState !== "idle"}
                  className="px-4 py-2 text-sm font-medium bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {restartState === "idle" && "Restart"}
                  {restartState === "requesting" && "Sending..."}
                  {restartState === "requested" && "Restarting..."}
                  {restartState === "error" && "Failed"}
                </button>
              </div>
              {restartState === "requested" && (
                <p className="text-xs text-hub-warning mt-2">
                  Bridge is restarting. This may take a few seconds...
                </p>
              )}
              {restartState === "error" && (
                <p className="text-xs text-hub-error mt-2">
                  Failed to restart bridge. Is the wrapper script (bridge.sh) running?
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="mb-6">
          <h2 className="text-xs font-medium text-hub-text-muted uppercase tracking-wider mb-3">
            Notifications
          </h2>
          <div className="bg-hub-surface border border-hub-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-hub-text">Push Notifications</p>
                <p className="text-xs text-hub-text-muted mt-0.5">
                  {pushState === "granted"
                    ? "You'll be notified when Claude needs your attention"
                    : pushState === "denied"
                    ? "Notifications blocked — enable in browser settings"
                    : pushState === "unsupported"
                    ? "Not supported in this browser"
                    : "Get notified for permissions, completions, and errors"}
                </p>
              </div>
              {pushState === "granted" ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Enabled
                  </span>
                  <button
                    type="button"
                    onClick={handleResubscribe}
                    className="px-3 py-1.5 text-xs font-medium bg-hub-surface-2 hover:bg-hub-border text-hub-text-muted rounded-lg transition-colors"
                  >
                    Re-subscribe
                  </button>
                </div>
              ) : pushState === "denied" ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-hub-text-muted">
                    <span className="w-2 h-2 rounded-full bg-hub-text-muted" />
                    Blocked
                  </span>
                  <button
                    type="button"
                    onClick={handleResubscribe}
                    className="px-3 py-1.5 text-xs font-medium bg-hub-surface-2 hover:bg-hub-border text-hub-text-muted rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : pushState === "unsupported" ? (
                <span className="text-sm text-hub-text-muted">N/A</span>
              ) : (
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={pushState === "subscribing"}
                  className="px-4 py-2 text-sm font-medium bg-hub-accent/10 hover:bg-hub-accent/20 text-hub-accent rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50 disabled:opacity-50"
                >
                  {pushState === "subscribing" ? "Enabling..." : "Enable"}
                </button>
              )}
            </div>
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
