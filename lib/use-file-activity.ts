"use client";
// ---------------------------------------------------------------------------
// useFileActivity — Parses tool calls from messages to extract file operations
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import type { UiMessage } from "@/lib/types";

export type FileAction = "Created" | "Edited" | "Read";

export interface FileActivityItem {
  path: string;
  action: FileAction;
  timestamp: string;
}

/** Map tool names to file actions */
const TOOL_ACTION_MAP: Record<string, FileAction> = {
  Write: "Created",
  Edit: "Edited",
  Read: "Read",
};

/**
 * Extracts file activity from a list of messages.
 * Deduplicates by path, keeping the most recent action.
 */
export function useFileActivity(messages: UiMessage[]): FileActivityItem[] {
  return useMemo(() => {
    const fileMap = new Map<string, FileActivityItem>();

    for (const msg of messages) {
      if (!msg.tool_name || msg.role !== "assistant") continue;

      const action = TOOL_ACTION_MAP[msg.tool_name];
      if (!action) continue;

      // Parse content to extract file_path from tool input
      let filePath: string | null = null;
      try {
        const parsed = JSON.parse(msg.content);
        filePath = parsed.file_path ?? null;
      } catch {
        // Content may be output text, not JSON input
        continue;
      }

      if (!filePath || typeof filePath !== "string") continue;

      // Always keep the most recent action for each path
      const existing = fileMap.get(filePath);
      if (!existing || new Date(msg.created_at) > new Date(existing.timestamp)) {
        fileMap.set(filePath, {
          path: filePath,
          action,
          timestamp: msg.created_at,
        });
      }
    }

    // Sort by timestamp descending (most recent first)
    return Array.from(fileMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [messages]);
}
