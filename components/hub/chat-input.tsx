"use client";
// ---------------------------------------------------------------------------
// ChatInput — Clean input with contextual action buttons
// Supports file upload and image paste
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { InstanceStatus } from "@/lib/types";

export interface Attachment {
  id: string;
  type: "file" | "image";
  name: string;
  preview?: string;
  file: File;
}

interface ChatInputProps {
  instanceId: string;
  onSend: (text: string, attachments?: Attachment[]) => Promise<void>;
  onInterrupt: () => void;
  instanceStatus: InstanceStatus;
  disabled?: boolean;
  modeBorderClass?: string;
}

const DRAFT_STORAGE_KEY = "claude-hub-drafts";

function getDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveDraft(instanceId: string, text: string) {
  if (typeof window === "undefined") return;
  try {
    const drafts = getDrafts();
    if (text.trim()) {
      drafts[instanceId] = text;
    } else {
      delete drafts[instanceId];
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Storage full or unavailable
  }
}

function loadDraft(instanceId: string): string {
  return getDrafts()[instanceId] || "";
}

export function ChatInput({
  instanceId,
  onSend,
  onInterrupt,
  instanceStatus,
  disabled = false,
  modeBorderClass = "border-hub-border focus-within:border-hub-accent/50",
}: ChatInputProps) {
  const [text, setText] = useState(() => loadDraft(instanceId));
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Load draft when switching instances
  useEffect(() => {
    setText(loadDraft(instanceId));
  }, [instanceId]);

  // Save draft when text changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(instanceId, text);
    }, 300);
    return () => clearTimeout(timer);
  }, [instanceId, text]);

  const isRunning = instanceStatus === "running";
  const isQueued = instanceStatus === "queued";
  const isBusy = isRunning || isQueued;
  const hasText = text.trim().length > 0;
  const hasAttachments = attachments.length > 0;
  const canSend = (hasText || hasAttachments) && !isSending;

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
    if ((!trimmed && attachments.length === 0) || trimmed.length > 50000) return;
    if (isSending) return; // Prevent double-tap on mobile

    setIsSending(true);
    const currentAttachments = [...attachments];
    setText("");
    setAttachments([]);
    saveDraft(instanceId, ""); // Clear draft on send
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      await onSend(trimmed, currentAttachments.length > 0 ? currentAttachments : undefined);
    } catch {
      // Error handling is in use-realtime.ts
    } finally {
      setIsSending(false);
    }
  };

  // File upload handler
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith("image/");
      const attachment: Attachment = {
        id: `${Date.now()}-${i}`,
        type: isImage ? "image" : "file",
        name: file.name,
        file,
      };

      // Create preview for images
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setAttachments(prev => prev.map(a =>
            a.id === attachment.id
              ? { ...a, preview: e.target?.result as string }
              : a
          ));
        };
        reader.readAsDataURL(file);
      }

      newAttachments.push(attachment);
    }

    setAttachments(prev => [...prev, ...newAttachments]);
  }, []);

  // Paste handler for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageItems.push(file);
      }
    }

    if (imageItems.length > 0) {
      e.preventDefault();
      const fileList = new DataTransfer();
      imageItems.forEach(f => fileList.items.add(f));
      handleFileSelect(fileList.files);
    }
  }, [handleFileSelect]);

  // Remove attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

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
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="relative group bg-hub-surface-2 rounded-lg border border-hub-border overflow-hidden"
              >
                {attachment.type === "image" && attachment.preview ? (
                  <img
                    src={attachment.preview}
                    alt={attachment.name}
                    className="w-16 h-16 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 flex flex-col items-center justify-center p-2">
                    <svg className="w-6 h-6 text-hub-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="text-[9px] text-hub-text-muted truncate max-w-full mt-0.5">
                      {attachment.name.slice(0, 8)}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.yml,.yaml,.xml,.csv,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp,.css,.scss,.html"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />

        {/* Input container with integrated buttons */}
        <div className={`flex items-end gap-2 bg-hub-surface-2 rounded-2xl border transition-colors ${modeBorderClass}`}>
          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              transcribing
                ? "Transcribing..."
                : recording
                  ? "Recording..."
                  : isBusy
                    ? "Queue a message..."
                    : "Message... (paste images or attach files)"
            }
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent px-4 py-2.5 text-sm text-hub-text placeholder-hub-text-muted/50 resize-none focus:outline-none disabled:opacity-50 min-h-[42px]"
          />

          {/* Action buttons container */}
          <div className="flex items-center gap-1 pr-2 pb-1.5">
            {/* Attach file button - when not busy */}
            {!isBusy && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-hub-border text-hub-text-muted hover:text-hub-text hover:bg-hub-text-muted/20 transition-colors disabled:opacity-50"
                aria-label="Attach file"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
              </button>
            )}

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

            {/* Mic button - when not busy and no text/attachments */}
            {!isBusy && !canSend && (
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

            {/* Send button - always visible when there's text or attachments */}
            {(canSend || isBusy) && (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  canSend
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
