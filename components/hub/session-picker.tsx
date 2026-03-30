"use client";
// ---------------------------------------------------------------------------
// SessionPicker — Shows local IDE sessions that can be resumed in Claude Hub
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";

interface LocalSession {
  id: string;
  preview: string;
  messageCount: number;
  lastActivityAt: string;
  createdAt: string;
  source: "ide" | "hub";
}

interface SessionPickerProps {
  instanceId: string;
  currentSessionId?: string | null;
  onClose: () => void;
  onSessionSwitch: () => void;
}

export function SessionPicker({
  instanceId,
  currentSessionId,
  onClose,
  onSessionSwitch,
}: SessionPickerProps) {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch local sessions
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch(`/api/instances/${instanceId}/sessions/local`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch sessions");
        const data = await res.json();
        setSessions(data.sessions || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [instanceId]);

  const handleSwitch = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) {
      onClose();
      return;
    }

    setSwitching(sessionId);
    setError(null);

    try {
      const res = await fetch(`/api/instances/${instanceId}/sessions/switch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, importMessages: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to switch session");
      }

      onSessionSwitch();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSwitching(null);
    }
  }, [instanceId, currentSessionId, onClose, onSessionSwitch]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md max-h-[80vh] bg-hub-bg border border-hub-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hub-border bg-hub-surface-2/50">
          <div>
            <h2 className="text-base font-semibold">Continue Session</h2>
            <p className="text-xs text-hub-text-muted mt-0.5">
              Resume a conversation from VS Code / Claude CLI
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-hub-surface-2 text-hub-text-muted hover:text-hub-text transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 text-xs text-hub-accent hover:underline"
              >
                Close
              </button>
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="px-4 py-12 text-center">
              <svg className="w-12 h-12 text-hub-text-muted/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <p className="text-sm text-hub-text-muted">No IDE sessions found</p>
              <p className="text-xs text-hub-text-muted/60 mt-1">
                Start a conversation in VS Code or Claude CLI first
              </p>
            </div>
          )}

          {!loading && !error && sessions.length > 0 && (
            <div className="py-2">
              {sessions.map((session) => {
                const isCurrent = session.id === currentSessionId;
                const isSwitching = switching === session.id;

                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => handleSwitch(session.id)}
                    disabled={isSwitching}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      isCurrent
                        ? "bg-hub-accent/10 border-l-2 border-hub-accent"
                        : "hover:bg-hub-surface-2 border-l-2 border-transparent"
                    } ${isSwitching ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                        isCurrent ? "bg-hub-accent/20 text-hub-accent" : "bg-hub-surface-2 text-hub-text-muted"
                      }`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                        </svg>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium truncate ${
                            isCurrent ? "text-hub-accent" : "text-hub-text"
                          }`}>
                            {session.preview || "Untitled session"}
                          </p>
                          {isCurrent && (
                            <span className="flex-shrink-0 text-[10px] font-medium text-hub-accent bg-hub-accent/10 px-1.5 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-hub-text-muted">
                          <span>{session.messageCount} messages</span>
                          <span>•</span>
                          <span>{formatDate(session.lastActivityAt)}</span>
                        </div>
                      </div>

                      {/* Loading indicator */}
                      {isSwitching && (
                        <div className="w-4 h-4 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-hub-border bg-hub-surface-2/30">
          <p className="text-[10px] text-hub-text-muted/60 text-center">
            Switching sessions will load the conversation history from your IDE
          </p>
        </div>
      </div>
    </div>
  );
}
