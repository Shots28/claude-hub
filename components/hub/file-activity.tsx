"use client";
// ---------------------------------------------------------------------------
// FileActivity — Slide-up panel showing files touched in the current session
// ---------------------------------------------------------------------------

import { useState } from "react";
import type { FileActivityItem } from "@/lib/use-file-activity";

interface FileActivityProps {
  files: FileActivityItem[];
  onViewFile: (filePath: string) => void;
  onClose: () => void;
}

const ACTION_COLORS: Record<string, string> = {
  Created: "text-emerald-400",
  Edited: "text-blue-400",
  Read: "text-hub-text-muted",
};

const ACTION_ICONS: Record<string, string> = {
  Created: "M12 4.5v15m7.5-7.5h-15",        // plus
  Edited: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z", // pencil
  Read: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z", // eye
};

export function FileActivity({ files, onViewFile, onClose }: FileActivityProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[60vh] bg-hub-bg border border-hub-border rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hub-border bg-hub-surface-2/50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-hub-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="text-sm font-medium">
              Files ({files.length})
            </span>
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

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-hub-text-muted">
                No files touched yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-hub-border/50">
              {files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => onViewFile(file.path)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-hub-surface-2/50 transition-colors text-left"
                >
                  {/* Action icon */}
                  <svg
                    className={`w-4 h-4 flex-shrink-0 ${ACTION_COLORS[file.action] || "text-hub-text-muted"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={ACTION_ICONS[file.action] || ACTION_ICONS.Read}
                    />
                    {/* Eye inner circle for Read */}
                    {file.action === "Read" && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    )}
                  </svg>

                  {/* File info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono truncate text-hub-text">
                      {file.path.split("/").pop()}
                    </p>
                    <p className="text-[10px] text-hub-text-muted truncate">
                      {file.path}
                    </p>
                  </div>

                  {/* Action label */}
                  <span
                    className={`text-[10px] font-medium flex-shrink-0 ${ACTION_COLORS[file.action] || "text-hub-text-muted"}`}
                  >
                    {file.action}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
