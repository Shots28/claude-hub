"use client";
// ---------------------------------------------------------------------------
// ChatInput — Clean input with contextual action buttons
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { InstanceStatus } from "@/lib/types";

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  onInterrupt: () => void;
  instanceStatus: InstanceStatus;
  disabled?: boolean;
  modeBorderClass?: string;
}

export function ChatInput({
  onSend,
  onInterrupt,
  instanceStatus,
  disabled = false,
  modeBorderClass = "border-hub-border focus-within:border-hub-accent/50",
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
  const hasText = text.trim().length > 0;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
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

    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await onSend(trimmed);
    } catch {
      // Error handling is in use-realtime.ts
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
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
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) return;

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
    <div className="border-t border-hub-border bg-hub-bg px-3 py-2.5 safe-area-bottom">
      <div className="max-w-3xl mx-auto">
        {/* Input container with integrated buttons */}
        <div className={`flex items-end gap-2 bg-hub-surface-2 rounded-2xl border transition-colors ${modeBorderClass}`}>
          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              transcribing
                ? "Transcribing..."
                : recording
                  ? "Recording..."
                  : isBusy
                    ? "Queue a message..."
                    : "Message..."
            }
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent px-4 py-2.5 text-sm text-hub-text placeholder-hub-text-muted/50 resize-none focus:outline-none disabled:opacity-50 min-h-[42px]"
          />

          {/* Action buttons container */}
          <div className="flex items-center gap-1 pr-2 pb-1.5">
            {/* Stop button - only when busy */}
            {isBusy && (
              <button
                type="button"
                onClick={onInterrupt}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 transition-colors"
                aria-label="Stop"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              </button>
            )}

            {/* Mic button - when not busy and no text */}
            {!isBusy && !hasText && (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={disabled || transcribing}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  recording
                    ? "bg-red-500 text-white animate-pulse"
                    : transcribing
                      ? "bg-hub-border text-hub-text-muted opacity-50"
                      : "bg-hub-border text-hub-text-muted hover:text-hub-text hover:bg-hub-text-muted/20"
                }`}
                aria-label={recording ? "Stop recording" : "Voice input"}
              >
                {transcribing ? (
                  <div className="w-3.5 h-3.5 border-2 border-hub-text-muted/30 border-t-hub-text-muted rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>
            )}

            {/* Send button - always visible when there's text */}
            {(hasText || isBusy) && (
              <button
                type="button"
                onClick={handleSend}
                disabled={!hasText}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  hasText
                    ? "bg-hub-accent hover:bg-hub-accent-hover active:bg-blue-700 text-white"
                    : "bg-hub-border text-hub-text-muted/30"
                }`}
                aria-label={isBusy ? "Queue message" : "Send"}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Recording indicator */}
        {recording && (
          <div className="mt-1.5 px-2">
            <span className="text-[11px] text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Recording... tap mic to stop
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
