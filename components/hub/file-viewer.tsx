"use client";
// ---------------------------------------------------------------------------
// FileViewer — Modal showing file content fetched via the bridge relay
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createBrowserClient } from "@/lib/supabase";
import type { DbFileRequest } from "@/lib/types";

interface FileViewerProps {
  instanceId: string;
  filePath: string;
  onClose: () => void;
}

type ViewerState = "loading" | "still-loading" | "content" | "error" | "timeout";

export function FileViewer({ instanceId, filePath, onClose }: FileViewerProps) {
  const [state, setState] = useState<ViewerState>("loading");
  const [content, setContent] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [showFullFile, setShowFullFile] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserClient>["channel"]> | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const supabaseRef = useRef(createBrowserClient());

  const isMarkdown = filePath.endsWith(".md");
  const fileName = filePath.split("/").pop() || filePath;

  const lines = content.split("\n");
  const lineCount = lines.length;
  const fileSize = new Blob([content]).size;
  const truncated = !showFullFile && lineCount > 500;
  const displayContent = truncated ? lines.slice(0, 200).join("\n") : content;

  // Create file request and subscribe to updates
  useEffect(() => {
    let cancelled = false;
    const sb = supabaseRef.current;

    // "Still loading..." timeout after 5s
    const stillLoadingTimer = setTimeout(() => {
      if (!cancelled) setState((s) => (s === "loading" ? "still-loading" : s));
    }, 5000);

    // Full timeout after 15s
    const timeoutTimer = setTimeout(() => {
      if (!cancelled) {
        setState((s) =>
          s === "loading" || s === "still-loading" ? "timeout" : s,
        );
      }
    }, 15000);

    async function createRequest() {
      try {
        const res = await fetch(`/api/instances/${instanceId}/files`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_path: filePath }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!cancelled) {
            setErrorMessage(data.error || `Request failed (${res.status})`);
            setState("error");
          }
          return;
        }

        const data = await res.json();
        const fileRequest = data.file_request as DbFileRequest;
        requestIdRef.current = fileRequest.id;

        // If already completed (cached), show immediately
        if (fileRequest.status === "completed" && fileRequest.content !== null) {
          if (!cancelled) {
            setContent(fileRequest.content);
            setState("content");
          }
          return;
        }

        if (fileRequest.status === "error") {
          if (!cancelled) {
            setErrorMessage(fileRequest.error_message || "Unknown error");
            setState("error");
          }
          return;
        }

        // Subscribe to Realtime updates on this specific row
        const channel = sb
          .channel(`file-request-${fileRequest.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "file_requests",
              filter: `id=eq.${fileRequest.id}`,
            },
            (payload) => {
              const updated = payload.new as DbFileRequest;
              if (cancelled) return;
              if (updated.status === "completed" && updated.content !== null) {
                setContent(updated.content);
                setState("content");
              } else if (updated.status === "error") {
                setErrorMessage(updated.error_message || "Unknown error");
                setState("error");
              }
            },
          )
          .subscribe();

        channelRef.current = channel;
      } catch (err) {
        if (!cancelled) {
          setErrorMessage((err as Error).message);
          setState("error");
        }
      }
    }

    createRequest();

    return () => {
      cancelled = true;
      clearTimeout(stillLoadingTimer);
      clearTimeout(timeoutTimer);
      if (channelRef.current) {
        sb.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [instanceId, filePath]);

  // Return the request ID for reuse by PlanViewer
  const getRequestId = useCallback(() => requestIdRef.current, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-2xl max-h-[85vh] bg-hub-bg border border-hub-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hub-border bg-hub-surface-2/50">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{fileName}</p>
            {state === "content" && (
              <p className="text-[10px] text-hub-text-muted mt-0.5">
                {formatFileSize(fileSize)} &middot; {lineCount} lines
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-hub-surface-2 text-hub-text-muted hover:text-hub-text transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading state */}
          {(state === "loading" || state === "still-loading") && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-hub-accent/30 border-t-hub-accent rounded-full animate-spin" />
              <p className="text-sm text-hub-text-muted">
                {state === "still-loading"
                  ? "Still loading..."
                  : "Fetching file..."}
              </p>
            </div>
          )}

          {/* Timeout */}
          {state === "timeout" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg className="w-10 h-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-hub-text-muted">
                Bridge may be offline
              </p>
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-hub-accent hover:underline"
              >
                Close
              </button>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-400">{errorMessage}</p>
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-hub-accent hover:underline"
              >
                Close
              </button>
            </div>
          )}

          {/* File content */}
          {state === "content" && (
            <div className="p-4">
              {isMarkdown ? (
                <div className="prose prose-invert prose-sm max-w-none break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {displayContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto text-hub-text-muted">
                  {displayContent.split("\n").map((line, i) => (
                    <div key={i} className="flex hover:bg-white/5">
                      <span className="select-none text-hub-text-muted/30 text-right w-10 pr-3 flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 whitespace-pre-wrap break-all">
                        {line}
                      </span>
                    </div>
                  ))}
                </pre>
              )}
              {truncated && (
                <div className="text-center mt-4 pb-2">
                  <button
                    type="button"
                    onClick={() => setShowFullFile(true)}
                    className="text-xs text-hub-accent hover:underline"
                  >
                    Show full file ({lineCount} lines)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
