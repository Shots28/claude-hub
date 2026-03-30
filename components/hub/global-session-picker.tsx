"use client";
// ---------------------------------------------------------------------------
// GlobalSessionPicker — Shows ALL local IDE sessions across all repos
// Used on the chats page to continue any desktop session from phone
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LocalSession {
  id: string;
  preview: string;
  messageCount: number;
  lastActivityAt: string;
  repoPath: string;
  repoName: string;
}

interface GlobalSessionPickerProps {
  onClose: () => void;
}

export function GlobalSessionPicker({ onClose }: GlobalSessionPickerProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch all local sessions across all repos
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch("/api/sessions/all", {
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
  }, []);

  const handleImport = useCallback(async (session: LocalSession) => {
    setImporting(session.id);
    setError(null);

    try {
      // Create or find instance for this repo, then switch to the session
      const res = await fetch("/api/sessions/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          repoPath: session.repoPath,
          repoName: session.repoName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to import session");
      }

      const data = await res.json();
      // Navigate to the instance
      router.push(`/instances/${data.instanceId}`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(null);
    }
  }, [router, onClose]);

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

  // Group sessions by repo
  const sessionsByRepo = sessions.reduce((acc, session) => {
    if (!acc[session.repoPath]) {
      acc[session.repoPath] = {
        repoName: session.repoName,
        sessions: [],
      };
    }
    acc[session.repoPath].sessions.push(session);
    return acc;
  }, {} as Record<string, { repoName: string; sessions: LocalSession[] }>);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[85vh] bg-hub-bg border border-hub-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hub-border bg-hub-surface-2/50">
          <div>
            <h2 className="text-base font-semibold">Continue from Desktop</h2>
            <p className="text-xs text-hub-text-muted mt-0.5">
              Resume a VS Code or CLI conversation
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
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="px-4 py-12 text-center">
              <svg className="w-12 h-12 text-hub-text-muted/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
              </svg>
              <p className="text-sm text-hub-text-muted">No desktop sessions found</p>
              <p className="text-xs text-hub-text-muted/60 mt-1">
                Start a conversation in VS Code or CLI first
              </p>
            </div>
          )}

          {!loading && !error && Object.keys(sessionsByRepo).length > 0 && (
            <div className="py-2">
              {Object.entries(sessionsByRepo).map(([repoPath, { repoName, sessions: repoSessions }]) => (
                <div key={repoPath} className="mb-4">
                  {/* Repo header */}
                  <div className="px-4 py-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-hub-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                    </svg>
                    <span className="text-sm font-medium text-hub-text">{repoName}</span>
                  </div>

                  {/* Sessions for this repo */}
                  {repoSessions.map((session) => {
                    const isImporting = importing === session.id;

                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => handleImport(session)}
                        disabled={isImporting}
                        className={`w-full text-left px-4 py-3 hover:bg-hub-surface-2 transition-colors ${
                          isImporting ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3 pl-6">
                          {/* Icon */}
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-hub-surface-2 text-hub-text-muted flex items-center justify-center">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                            </svg>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-hub-text truncate">
                              {session.preview || "Untitled session"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-hub-text-muted">
                              <span>{session.messageCount} messages</span>
                              <span>•</span>
                              <span>{formatDate(session.lastActivityAt)}</span>
                            </div>
                          </div>

                          {/* Loading indicator */}
                          {isImporting && (
                            <div className="w-4 h-4 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
