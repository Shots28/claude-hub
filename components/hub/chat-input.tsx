"use client";
// ---------------------------------------------------------------------------
// ChatInput — Text input with send/interrupt/voice toggle
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { InstanceStatus } from "@/lib/types";

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  onInterrupt: () => void;
  instanceStatus: InstanceStatus;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onInterrupt,
  instanceStatus,
  disabled = false,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isRunning = instanceStatus === "running";
  const isQueued = instanceStatus === "queued";
  const isBusy = isRunning || isQueued;
  // Allow sending messages even when busy - they will be queued
  const canSend = text.trim().length > 0;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim().replace(/\0/g, "");
    if (!trimmed || trimmed.length > 50000) return;

    // Clear input immediately for responsiveness
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Delivery status is now shown on the message bubble itself (pending/delivered/failed)
    // No misleading "Sent" status here — the bubble's delivery indicator is the source of truth
    try {
      await onSend(trimmed);
    } catch {
      // Error handling is in use-realtime.ts — message bubble shows "failed" state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Always send message (will be queued if busy)
      handleSend();
    } else if (e.key === "Escape" && isRunning) {
      // Escape to interrupt when running
      onInterrupt();
    }
  };

  // --- Voice recording ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) return; // Too short

        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob);

          const res = await fetch("/api/transcribe", {
            method: "POST",
            credentials: "include",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.text) {
              setText((prev) => (prev ? prev + " " + data.text : data.text));
              textareaRef.current?.focus();
            }
          }
        } catch {
          // Silently fail
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch {
      // Mic not available
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="border-t border-hub-border bg-hub-bg px-3 py-3 safe-area-bottom">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        {/* Voice button */}
        <button
          type="button"
          onClick={toggleRecording}
          disabled={disabled || transcribing}
          className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-colors focus:outline-none ${
            recording
              ? "bg-red-600 text-white animate-pulse"
              : transcribing
                ? "bg-hub-surface-2 text-hub-text-muted opacity-50"
                : "bg-hub-surface-2 text-hub-text-muted hover:text-hub-text hover:bg-hub-border"
          }`}
          aria-label={recording ? "Stop recording" : "Voice input"}
        >
          {transcribing ? (
            <div className="w-4 h-4 border-2 border-hub-text-muted/30 border-t-hub-accent rounded-full animate-spin" />
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          )}
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              transcribing
                ? "Transcribing..."
                : recording
                  ? "Recording... tap mic to stop"
                  : isBusy
                    ? "Type to queue another message..."
                    : "Message Claude..."
            }
            disabled={disabled}
            rows={1}
            className="w-full bg-hub-surface-2 border border-hub-border rounded-xl px-4 py-2.5 text-sm text-hub-text placeholder-hub-text-muted/50 resize-none focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50 disabled:opacity-50 transition-colors"
          />
        </div>

        {/* Interrupt button - shown when running */}
        {isBusy && (
          <button
            type="button"
            onClick={onInterrupt}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
            aria-label="Interrupt"
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        )}

        {/* Send button - always available */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-hub-accent hover:bg-hub-accent-hover active:bg-blue-700 disabled:bg-hub-surface-2 disabled:text-hub-text-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50"
          aria-label={isBusy ? "Queue message" : "Send"}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>

      {/* Status indicators */}
      {recording && (
        <div className="max-w-3xl mx-auto mt-1.5 px-1">
          <span className="text-[11px] text-red-400">Recording...</span>
        </div>
      )}
    </div>
  );
}
