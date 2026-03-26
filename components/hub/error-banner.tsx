"use client";
// ---------------------------------------------------------------------------
// ErrorBanner — Dismissible error toast for surfacing connection/send errors
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Animate in when message appears, auto-dismiss after 8s
  useEffect(() => {
    if (message) {
      setExiting(false);
      // Small delay to allow CSS transition to trigger
      requestAnimationFrame(() => setVisible(true));

      // Auto-dismiss after 8 seconds
      timerRef.current = setTimeout(() => {
        dismiss();
      }, 8_000);
    } else {
      setVisible(false);
      setExiting(false);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    // Wait for exit animation before calling onDismiss
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      onDismiss();
    }, 200);
  };

  if (!message) return null;

  return (
    <div
      className={`flex-shrink-0 overflow-hidden transition-all duration-200 ease-out ${
        visible && !exiting
          ? "max-h-20 opacity-100"
          : "max-h-0 opacity-0"
      }`}
    >
      <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          {/* Error icon */}
          <div className="flex items-center gap-2 min-w-0">
            <svg
              className="w-4 h-4 text-red-400 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p className="text-xs text-red-400 truncate">{message}</p>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={dismiss}
            className="flex-shrink-0 p-1 rounded hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors"
            aria-label="Dismiss error"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
