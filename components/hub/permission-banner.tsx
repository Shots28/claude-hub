"use client";
// ---------------------------------------------------------------------------
// PermissionBanner — Sticky banner for pending permission requests
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { DbPendingPermission } from "@/lib/types";

interface PermissionBannerProps {
  permission: DbPendingPermission;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

// Default timeout: 5 minutes from request time (matches server-side timeout)
const TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Audio alert via Web Audio API (works on iOS 17+ with oscillator trick)
// ---------------------------------------------------------------------------

let _audioCtx: AudioContext | null = null;
let _audioUnlocked = false;

/**
 * Unlock AudioContext on the first user gesture (tap/click).
 * iOS requires a connected oscillator before ctx.resume() works.
 */
function unlockAudio(): void {
  if (_audioUnlocked) return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    _audioCtx = new AudioContextClass();
    // iOS 17+ needs a real oscillator connected before resume
    const osc = _audioCtx.createOscillator();
    osc.connect(_audioCtx.destination);
    osc.start();
    osc.stop();
    _audioCtx.resume().catch(() => {});
    _audioUnlocked = true;
  } catch {
    // Audio not available — silently ignore
  }
}

// Register the unlock handler once
if (typeof window !== "undefined") {
  const handler = () => {
    unlockAudio();
    document.removeEventListener("click", handler, true);
    document.removeEventListener("touchstart", handler, true);
  };
  document.addEventListener("click", handler, true);
  document.addEventListener("touchstart", handler, true);
}

/**
 * Play a short attention-grabbing chime using Web Audio API oscillators.
 * Falls back silently if AudioContext is not unlocked.
 */
function playAlertChime(): void {
  if (!_audioCtx || _audioCtx.state !== "running") return;

  try {
    const ctx = _audioCtx;
    const now = ctx.currentTime;

    // Two-tone chime: ascending notes
    const frequencies = [523.25, 659.25]; // C5, E5
    for (let i = 0; i < frequencies.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = frequencies[i];

      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.35);
    }
  } catch {
    // Audio playback failed — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Tool input summary helper
// ---------------------------------------------------------------------------

function getToolInputSummary(
  toolName: string,
  toolInput: Record<string, unknown>
): { label: string; value: string } | null {
  const name = toolName.toLowerCase();

  if (name === "bash" || name.includes("bash")) {
    const cmd = toolInput.command || toolInput.cmd;
    if (typeof cmd === "string") return { label: "Command", value: cmd };
  }

  if (name === "edit" || name.includes("edit")) {
    const fp = toolInput.file_path || toolInput.filePath || toolInput.path;
    if (typeof fp === "string") return { label: "File", value: fp };
  }

  if (name === "write" || name.includes("write")) {
    const fp = toolInput.file_path || toolInput.filePath || toolInput.path;
    if (typeof fp === "string") return { label: "File", value: fp };
  }

  if (name === "read" || name.includes("read")) {
    const fp = toolInput.file_path || toolInput.filePath || toolInput.path;
    if (typeof fp === "string") return { label: "File", value: fp };
  }

  // Fallback: show a generic summary for unknown tools
  const firstStringVal = Object.values(toolInput).find((v) => typeof v === "string") as string | undefined;
  if (firstStringVal) {
    return { label: "Input", value: firstStringVal.length > 500 ? firstStringVal.slice(0, 500) + "..." : firstStringVal };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PermissionBanner({
  permission,
  onApprove,
  onDeny,
}: PermissionBannerProps) {
  const [remainingMs, setRemainingMs] = useState(() => {
    const requested = new Date(permission.requested_at).getTime();
    const expiresAt = requested + TIMEOUT_MS;
    return Math.max(0, expiresAt - Date.now());
  });
  const [showDetails, setShowDetails] = useState(false);
  const alertFiredRef = useRef(false);

  // Fire sound + haptic once when the banner first appears
  useEffect(() => {
    if (alertFiredRef.current) return;
    alertFiredRef.current = true;

    // Haptic feedback (Android — no-op on iOS)
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(200);
    }

    // Audio chime via Web Audio API
    playAlertChime();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const requested = new Date(permission.requested_at).getTime();
      const expiresAt = requested + TIMEOUT_MS;
      const remaining = Math.max(0, expiresAt - Date.now());
      setRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [permission.requested_at]);

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const isExpired = remainingMs <= 0;

  const toolInput = (permission.input || {}) as Record<string, unknown>;
  const inputSummary = getToolInputSummary(permission.tool_name, toolInput);

  return (
    <div className="animate-slide-down sticky top-0 z-20 bg-amber-500/10 border-b border-amber-500/30 px-4 py-3 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        {/* Warning icon with pulse animation */}
        <div className="flex-shrink-0 relative">
          <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
          <svg
            className="w-5 h-5 text-amber-400 relative"
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
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-amber-200">
            Permission requested:{" "}
            <span className="font-mono text-amber-100">
              {permission.tool_name}
            </span>
            {inputSummary && (
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="ml-2 text-[10px] text-amber-300/70 hover:text-amber-200 underline transition-colors"
              >
                {showDetails ? "hide" : "details"}
              </button>
            )}
          </div>
          <div className="text-xs text-amber-300/70 mt-0.5">
            {isExpired ? "Expired" : `Expires in ${timeStr}`}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => onDeny(permission.id)}
            disabled={isExpired}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => onApprove(permission.id)}
            disabled={isExpired}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            Approve
          </button>
        </div>
      </div>

      {/* Collapsible tool input details */}
      {showDetails && inputSummary && (
        <div className="max-w-3xl mx-auto mt-2 px-8">
          <div className="bg-neutral-900/50 border border-amber-500/20 rounded-lg px-3 py-2">
            <span className="text-[10px] font-medium text-amber-300/60 uppercase tracking-wider">
              {inputSummary.label}
            </span>
            <p className="text-xs font-mono text-amber-100/80 mt-0.5 break-all leading-relaxed">
              {inputSummary.value.length > 500
                ? inputSummary.value.slice(0, 500) + "..."
                : inputSummary.value}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
