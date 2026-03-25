// ---------------------------------------------------------------------------
// Claude Hub — Structured JSON Logger
// ---------------------------------------------------------------------------
// Appends newline-delimited JSON to data/events.log.
// Auto-rotates when the file exceeds 10 MB (renames → events.log.1).
// ---------------------------------------------------------------------------

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

// ---- Config ----

const DATA_DIR = join(process.cwd(), "data");
const LOG_PATH = join(DATA_DIR, "events.log");
const ROTATED_PATH = join(DATA_DIR, "events.log.1");
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ---- Types ----

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  instanceId?: string;
  details?: Record<string, unknown>;
}

// ---- Internal helpers ----

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Rotate the log file if it exceeds MAX_SIZE_BYTES.
 * Simple single-generation rotation: events.log → events.log.1 (overwrite).
 */
function rotateIfNeeded(): void {
  try {
    if (!existsSync(LOG_PATH)) return;
    const stat = statSync(LOG_PATH);
    if (stat.size >= MAX_SIZE_BYTES) {
      renameSync(LOG_PATH, ROTATED_PATH);
    }
  } catch {
    // Rotation is best-effort — never crash the caller.
  }
}

// ---- Public API ----

/**
 * Write a structured log entry to data/events.log.
 *
 * @param level   - "info" | "warn" | "error"
 * @param event   - Short machine-readable event name (e.g. "instance.started")
 * @param details - Optional object with additional context
 */
export function log(
  level: LogLevel,
  event: string,
  details?: { instanceId?: string } & Record<string, unknown>,
): void {
  ensureDataDir();
  rotateIfNeeded();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
  };

  if (details?.instanceId) {
    entry.instanceId = details.instanceId;
    // Remove from details to avoid duplication in the JSON output
    const { instanceId: _, ...rest } = details;
    if (Object.keys(rest).length > 0) {
      entry.details = rest;
    }
  } else if (details) {
    const { instanceId: _, ...rest } = details;
    if (Object.keys(rest).length > 0) {
      entry.details = rest;
    }
  }

  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (err) {
    // Last-resort fallback: stderr
    console.error("[logger] Failed to write log entry:", err);
    console.error(JSON.stringify(entry));
  }
}

/** Convenience: log at "info" level. */
export function logInfo(
  event: string,
  details?: { instanceId?: string } & Record<string, unknown>,
): void {
  log("info", event, details);
}

/** Convenience: log at "warn" level. */
export function logWarn(
  event: string,
  details?: { instanceId?: string } & Record<string, unknown>,
): void {
  log("warn", event, details);
}

/** Convenience: log at "error" level. */
export function logError(
  event: string,
  details?: { instanceId?: string } & Record<string, unknown>,
): void {
  log("error", event, details);
}
