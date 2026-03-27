"use client";
// ---------------------------------------------------------------------------
// ActivityItem — Distinct activity items for tool calls, file operations, etc.
// Shows tool calls, file operations, bash commands, git actions, agent spawns
// ---------------------------------------------------------------------------

import { useState, useMemo } from "react";
import type { UiMessage } from "@/lib/types";

interface ActivityItemProps {
  message: UiMessage;
  onViewPlan?: (planPath: string) => void;
  onSendResponse?: (response: string) => void;
}

type ActivityType =
  | "file_read"
  | "file_write"
  | "file_edit"
  | "bash_command"
  | "git_action"
  | "agent_spawn"
  | "search"
  | "web_fetch"
  | "plan_create"
  | "other_tool";

interface ParsedActivity {
  type: ActivityType;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  details?: Record<string, unknown>;
}

function parseActivity(message: UiMessage): ParsedActivity | null {
  if (!message.tool_name) return null;

  const toolName = message.tool_name;
  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(message.content) || {};
  } catch {
    // content might be plain output text
  }

  // File Read
  if (toolName === "Read") {
    const filePath = input.file_path as string || "";
    const fileName = filePath.split("/").pop() || "file";
    return {
      type: "file_read",
      title: "Read file",
      description: fileName,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      details: { path: filePath },
    };
  }

  // File Write
  if (toolName === "Write") {
    const filePath = input.file_path as string || "";
    const fileName = filePath.split("/").pop() || "file";
    const isPlan = /\.claude\/plans\/[^/]+\.md$/.test(filePath);

    if (isPlan) {
      return {
        type: "plan_create",
        title: "Created plan",
        description: fileName,
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        ),
        color: "text-purple-400",
        bgColor: "bg-purple-500/10",
        details: { path: filePath },
      };
    }

    return {
      type: "file_write",
      title: "Created file",
      description: fileName,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      details: { path: filePath },
    };
  }

  // File Edit
  if (toolName === "Edit") {
    const filePath = input.file_path as string || "";
    const fileName = filePath.split("/").pop() || "file";
    return {
      type: "file_edit",
      title: "Edited file",
      description: fileName,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      ),
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/10",
      details: { path: filePath },
    };
  }

  // Bash Command
  if (toolName === "Bash") {
    const command = input.command as string || "";
    const shortCommand = command.length > 50 ? command.slice(0, 50) + "..." : command;
    const isGitCommand = command.startsWith("git ");

    if (isGitCommand) {
      const gitAction = command.split(" ")[1] || "command";
      return {
        type: "git_action",
        title: `Git ${gitAction}`,
        description: shortCommand,
        icon: (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        ),
        color: "text-orange-400",
        bgColor: "bg-orange-500/10",
        details: { command },
      };
    }

    return {
      type: "bash_command",
      title: "Ran command",
      description: shortCommand,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
      color: "text-gray-400",
      bgColor: "bg-gray-500/10",
      details: { command },
    };
  }

  // Task (Agent spawn)
  if (toolName === "Task") {
    const description = input.description as string || "Running task";
    return {
      type: "agent_spawn",
      title: "Spawned agent",
      description,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
      color: "text-indigo-400",
      bgColor: "bg-indigo-500/10",
      details: input,
    };
  }

  // Grep/Glob (Search)
  if (toolName === "Grep" || toolName === "Glob") {
    const pattern = (input.pattern as string) || "";
    return {
      type: "search",
      title: toolName === "Grep" ? "Searched code" : "Found files",
      description: pattern,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      ),
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
      details: input,
    };
  }

  // WebFetch / WebSearch
  if (toolName === "WebFetch" || toolName === "WebSearch") {
    const url = (input.url as string) || (input.query as string) || "";
    const shortUrl = url.length > 40 ? url.slice(0, 40) + "..." : url;
    return {
      type: "web_fetch",
      title: toolName === "WebSearch" ? "Web search" : "Fetched URL",
      description: shortUrl,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
      ),
      color: "text-teal-400",
      bgColor: "bg-teal-500/10",
      details: input,
    };
  }

  // ExitPlanMode - special handling for plan approval
  if (toolName === "ExitPlanMode") {
    return {
      type: "other_tool",
      title: "Ready for approval",
      description: "Plan complete",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      details: undefined, // No details to show
    };
  }

  // AskUserQuestion - special handling with question preview
  if (toolName === "AskUserQuestion") {
    // Extract question text from input if available
    const questions = input.questions as Array<{ question?: string; header?: string }> | undefined;
    const firstQuestion = questions?.[0];
    const questionText = firstQuestion?.question || firstQuestion?.header || "";
    const shortQuestion = questionText.length > 50 ? questionText.slice(0, 50) + "..." : questionText;

    return {
      type: "other_tool",
      title: "Asked question",
      description: shortQuestion,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      ),
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      details: Object.keys(input).length > 0 ? input : undefined,
    };
  }

  // EnterPlanMode
  if (toolName === "EnterPlanMode") {
    return {
      type: "other_tool",
      title: "Entered plan mode",
      description: "",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      ),
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      details: undefined,
    };
  }

  // TodoWrite
  if (toolName === "TodoWrite") {
    return {
      type: "other_tool",
      title: "Updated todos",
      description: "",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: "text-violet-400",
      bgColor: "bg-violet-500/10",
      details: input,
    };
  }

  // Default/Other tool
  return {
    type: "other_tool",
    title: `Used ${toolName}`,
    description: "",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    color: "text-hub-text-muted",
    bgColor: "bg-hub-surface-2",
    details: Object.keys(input).length > 0 ? input : undefined, // Don't show empty details
  };
}

export function ActivityItem({ message, onViewPlan, onSendResponse }: ActivityItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState("");
  const [responded, setResponded] = useState(false);

  const activity = useMemo(() => parseActivity(message), [message]);

  if (!activity) return null;

  const isPlan = activity.type === "plan_create";
  const planPath = isPlan ? (activity.details?.path as string) : null;

  return (
    <div className="px-4 py-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg ${activity.bgColor} border border-transparent hover:border-hub-border/50 transition-all text-left`}
      >
        {/* Icon */}
        <div className={`flex-shrink-0 ${activity.color}`}>
          {activity.icon}
        </div>

        {/* Title & Description */}
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-medium ${activity.color}`}>
            {activity.title}
          </span>
          {activity.description && (
            <span className="text-xs text-hub-text-muted ml-1.5 truncate">
              {activity.description}
            </span>
          )}
        </div>

        {/* Error indicator */}
        {message.is_error && (
          <span className="flex-shrink-0 text-[10px] font-medium text-red-400 px-1.5 py-0.5 rounded bg-red-500/10">
            error
          </span>
        )}

        {/* View Plan button */}
        {isPlan && planPath && onViewPlan && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onViewPlan(planPath);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onViewPlan(planPath);
              }
            }}
            className="flex-shrink-0 text-[10px] font-medium text-purple-400 px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 transition-colors cursor-pointer"
          >
            View Plan
          </span>
        )}

        {/* Expand chevron */}
        <svg
          className={`w-3.5 h-3.5 text-hub-text-muted/50 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && activity.details && (
        <div className="mt-1 ml-9 mr-2 p-2 rounded-lg bg-hub-surface border border-hub-border">
          <pre className="text-[11px] text-hub-text-muted overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(activity.details, null, 2)}
          </pre>
        </div>
      )}

      {/* Interactive UI for ExitPlanMode */}
      {message.tool_name === "ExitPlanMode" && !responded && onSendResponse && (
        <div className="mt-2 ml-9 mr-2 flex flex-col gap-2">
          <p className="text-xs text-hub-text-muted mb-1">
            Claude has prepared a plan. What would you like to do?
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setResponded(true);
                onSendResponse("Approved. Please proceed with the implementation.");
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 active:scale-95 transition-all"
            >
              Approve Plan
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setResponded(true);
                const feedback = prompt("What changes would you like?");
                if (feedback) {
                  onSendResponse(`Please revise the plan: ${feedback}`);
                } else {
                  setResponded(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 active:scale-95 transition-all"
            >
              Request Changes
            </button>
          </div>
        </div>
      )}

      {/* Interactive UI for AskUserQuestion */}
      {message.tool_name === "AskUserQuestion" && !responded && onSendResponse && (() => {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(message.content) || {};
        } catch {
          // ignore parse errors
        }
        const questions = input.questions as Array<{
          question?: string;
          header?: string;
          options?: Array<{ label?: string; description?: string }>;
          multiSelect?: boolean;
        }> | undefined;

        if (!questions || questions.length === 0) return null;

        return (
          <div className="mt-2 ml-9 mr-2 flex flex-col gap-3">
            {questions.map((q, qIdx) => (
              <div key={qIdx} className="flex flex-col gap-2">
                <p className="text-xs text-hub-text font-medium">
                  {q.question || q.header || "Choose an option:"}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {q.options?.map((opt, optIdx) => {
                    const optKey = `${qIdx}-${optIdx}`;
                    const isSelected = selectedOptions.has(optKey);
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => {
                          if (q.multiSelect) {
                            const newSelected = new Set(selectedOptions);
                            if (isSelected) {
                              newSelected.delete(optKey);
                            } else {
                              newSelected.add(optKey);
                            }
                            setSelectedOptions(newSelected);
                          } else {
                            // Single select - respond immediately
                            setResponded(true);
                            onSendResponse(opt.label || `Option ${optIdx + 1}`);
                          }
                        }}
                        title={opt.description}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                          isSelected
                            ? "bg-hub-accent text-white border border-hub-accent"
                            : "bg-hub-surface-2 text-hub-text border border-hub-border hover:bg-hub-border"
                        }`}
                      >
                        {opt.label || `Option ${optIdx + 1}`}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const customResponse = prompt("Enter your response:");
                      if (customResponse) {
                        setResponded(true);
                        onSendResponse(customResponse);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-hub-surface-2 text-hub-text-muted border border-hub-border hover:bg-hub-border transition-all active:scale-95"
                  >
                    Other...
                  </button>
                </div>
                {/* Multi-select submit button */}
                {q.multiSelect && selectedOptions.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const selectedLabels = Array.from(selectedOptions)
                        .filter(key => key.startsWith(`${qIdx}-`))
                        .map(key => {
                          const optIdx = parseInt(key.split("-")[1]);
                          return q.options?.[optIdx]?.label || `Option ${optIdx + 1}`;
                        });
                      setResponded(true);
                      onSendResponse(selectedLabels.join(", "));
                    }}
                    className="self-start px-3 py-1.5 rounded-lg text-xs font-medium bg-hub-accent text-white hover:bg-hub-accent-hover active:scale-95 transition-all"
                  >
                    Submit Selection
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Show responded state */}
      {responded && (message.tool_name === "ExitPlanMode" || message.tool_name === "AskUserQuestion") && (
        <div className="mt-2 ml-9 mr-2">
          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Response sent
          </span>
        </div>
      )}
    </div>
  );
}

// Helper function to check if a message should be rendered as an activity item
export function isActivityMessage(message: UiMessage): boolean {
  return !!message.tool_name;
}
