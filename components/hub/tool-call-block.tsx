"use client";
// ---------------------------------------------------------------------------
// ToolCallBlock — Collapsible block showing tool name, input, output
// ---------------------------------------------------------------------------

import { useState } from "react";

interface ToolCallBlockProps {
  toolName: string;
  toolId: string;
  input?: Record<string, unknown>;
  output?: string;
  isError?: boolean;
}

export function ToolCallBlock({
  toolName,
  toolId,
  input,
  output,
  isError = false,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const borderColor = isError
    ? "border-red-500/30"
    : "border-emerald-500/30";
  const iconColor = isError ? "text-red-400" : "text-emerald-400";
  const bgColor = isError ? "bg-red-500/5" : "bg-emerald-500/5";

  return (
    <div
      className={`my-1.5 rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-hub-text-muted transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>

        {/* Tool icon */}
        <svg
          className={`w-3.5 h-3.5 ${iconColor}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.42 15.17l-1.42 1.42a4 4 0 11-5.66-5.66l1.42-1.42m8.48 8.48l1.42-1.42a4 4 0 10-5.66-5.66l-1.42 1.42m6.36-6.36l-8.49 8.49"
          />
        </svg>

        <span className="text-xs font-medium text-hub-text-muted flex-1 truncate">
          Used{" "}
          <span className={`font-mono ${iconColor}`}>{toolName}</span>
        </span>

        {isError && (
          <span className="text-[10px] font-medium text-red-400 px-1.5 py-0.5 rounded bg-red-500/10">
            error
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-hub-border/50">
          {input && Object.keys(input).length > 0 && (
            <div className="pt-2">
              <div className="text-[10px] font-medium text-hub-text-muted uppercase tracking-wider mb-1">
                Input
              </div>
              <pre className="text-xs bg-neutral-900/80 rounded-md p-2 overflow-x-auto text-hub-text-muted leading-relaxed">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}

          {output && (
            <div>
              <div className="text-[10px] font-medium text-hub-text-muted uppercase tracking-wider mb-1">
                Output
              </div>
              <pre
                className={`text-xs rounded-md p-2 overflow-x-auto leading-relaxed ${
                  isError
                    ? "bg-red-500/10 text-red-300"
                    : "bg-neutral-900/80 text-hub-text-muted"
                }`}
              >
                {output.length > 2000
                  ? output.slice(0, 2000) + "\n... (truncated)"
                  : output}
              </pre>
            </div>
          )}

          <div className="text-[10px] text-hub-text-muted/50 font-mono">
            {toolId}
          </div>
        </div>
      )}
    </div>
  );
}
