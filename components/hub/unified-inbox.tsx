"use client";
// ---------------------------------------------------------------------------
// UnifiedInbox — Single screen showing all pending items across all sessions
// Categories: Approvals (permissions), Plans, Questions, Completions
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DbInstance, DbPendingPermission, UiMessage } from "@/lib/types";

interface UnifiedInboxProps {
  instances: DbInstance[];
  messages: UiMessage[];
  pendingPermissions: DbPendingPermission[];
  onApprove: (permissionId: string) => Promise<void>;
  onDeny: (permissionId: string) => Promise<void>;
  open: boolean;
  onClose: () => void;
}

type TabType = "approvals" | "plans" | "questions" | "completions";

interface InboxItem {
  id: string;
  type: "approval" | "plan" | "question" | "completion";
  instanceId: string;
  instanceName: string;
  title: string;
  preview: string;
  timestamp: string;
  data?: unknown;
}

function TabButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-hub-accent text-white"
          : "bg-hub-surface-2 text-hub-text-muted hover:text-hub-text"
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold ${
          active ? "bg-white/20" : "bg-hub-accent/20 text-hub-accent"
        }`}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

function ApprovalCard({
  item,
  permission,
  onApprove,
  onDeny,
}: {
  item: InboxItem;
  permission: DbPendingPermission;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    setProcessing(true);
    try {
      await onApprove();
    } finally {
      setProcessing(false);
    }
  };

  const handleDeny = async () => {
    setProcessing(true);
    try {
      await onDeny();
    } finally {
      setProcessing(false);
    }
  };

  const toolIcon = getToolIcon(permission.tool_name);

  return (
    <div className="bg-hub-surface-2 rounded-xl border border-hub-border p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          {toolIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-hub-text-muted">{item.instanceName}</span>
            <span className="text-[10px] text-hub-text-muted/60">
              {formatTime(item.timestamp)}
            </span>
          </div>
          <h3 className="text-sm font-medium text-hub-text mb-1">{item.title}</h3>
          <p className="text-xs text-hub-text-muted line-clamp-2">{item.preview}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={handleApprove}
          disabled={processing}
          className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {processing ? "..." : "Approve"}
        </button>
        <button
          type="button"
          onClick={handleDeny}
          disabled={processing}
          className="flex-1 py-2 rounded-lg bg-hub-surface hover:bg-hub-border text-hub-text-muted text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {processing ? "..." : "Deny"}
        </button>
        <Link
          href={`/instances/${item.instanceId}`}
          className="py-2 px-3 rounded-lg bg-hub-surface hover:bg-hub-border text-hub-text-muted text-xs font-medium transition-colors"
        >
          View
        </Link>
      </div>
    </div>
  );
}

function PlanCard({ item }: { item: InboxItem }) {
  return (
    <Link
      href={`/instances/${item.instanceId}`}
      className="block bg-hub-surface-2 rounded-xl border border-hub-border p-4 hover:border-hub-accent/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-hub-text-muted">{item.instanceName}</span>
            <span className="text-[10px] text-hub-text-muted/60">
              {formatTime(item.timestamp)}
            </span>
          </div>
          <h3 className="text-sm font-medium text-hub-text mb-1">{item.title}</h3>
          <p className="text-xs text-hub-text-muted line-clamp-2">{item.preview}</p>
        </div>
        <svg className="w-4 h-4 text-hub-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

function QuestionCard({ item }: { item: InboxItem }) {
  return (
    <Link
      href={`/instances/${item.instanceId}`}
      className="block bg-hub-surface-2 rounded-xl border border-hub-border p-4 hover:border-hub-accent/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-hub-text-muted">{item.instanceName}</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/15 text-purple-400">
              Needs input
            </span>
          </div>
          <h3 className="text-sm font-medium text-hub-text mb-1">{item.title}</h3>
          <p className="text-xs text-hub-text-muted line-clamp-2">{item.preview}</p>
        </div>
        <svg className="w-4 h-4 text-hub-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

function CompletionCard({ item }: { item: InboxItem }) {
  return (
    <Link
      href={`/instances/${item.instanceId}`}
      className="block bg-hub-surface-2 rounded-xl border border-hub-border p-4 hover:border-hub-accent/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-hub-text-muted">{item.instanceName}</span>
            <span className="text-[10px] text-hub-text-muted/60">
              {formatTime(item.timestamp)}
            </span>
          </div>
          <h3 className="text-sm font-medium text-hub-text mb-1">{item.title}</h3>
          <p className="text-xs text-hub-text-muted line-clamp-2">{item.preview}</p>
        </div>
        <svg className="w-4 h-4 text-hub-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>
    </Link>
  );
}

function getToolIcon(toolName: string) {
  if (toolName === "Bash") {
    return (
      <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
      </svg>
    );
  }
  if (toolName === "Write" || toolName === "Edit") {
    return (
      <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Detect if a message contains a clarifying question
function isQuestionMessage(message: UiMessage): boolean {
  if (message.role !== "assistant") return false;
  const content = message.content.toLowerCase();

  // Check for question patterns
  const questionPatterns = [
    /would you like me to/,
    /do you want me to/,
    /should i/,
    /which (?:option|approach|method)/,
    /could you (?:clarify|specify|confirm)/,
    /please (?:confirm|specify|choose)/,
    /\?$/,
    /before i proceed/,
    /i need (?:more information|clarification|to know)/,
  ];

  return questionPatterns.some(pattern => pattern.test(content));
}

// Detect if a message indicates work completion
function isCompletionMessage(message: UiMessage): boolean {
  if (message.role !== "assistant") return false;
  const content = message.content.toLowerCase();

  const completionPatterns = [
    /i(?:'ve| have) (?:completed|finished|done|implemented)/,
    /the (?:changes|updates|implementation) (?:are|is) (?:complete|done|ready)/,
    /successfully (?:created|updated|implemented|fixed)/,
    /all (?:tasks|items|changes) (?:are|have been) completed/,
    /here's what i (?:did|changed|implemented)/,
  ];

  return completionPatterns.some(pattern => pattern.test(content));
}

export function UnifiedInbox({
  instances,
  messages,
  pendingPermissions,
  onApprove,
  onDeny,
  open,
  onClose,
}: UnifiedInboxProps) {
  const [activeTab, setActiveTab] = useState<TabType>("approvals");

  // Build inbox items from various sources
  const items = useMemo(() => {
    const result: InboxItem[] = [];
    const instanceMap = new Map(instances.map(i => [i.id, i]));

    // Approvals (pending permissions)
    for (const perm of pendingPermissions) {
      if (perm.status !== "pending") continue;
      const instance = instanceMap.get(perm.instance_id);
      if (!instance) continue;

      const input = perm.input as Record<string, unknown>;
      let preview = "";
      if (perm.tool_name === "Bash" && input.command) {
        preview = String(input.command);
      } else if ((perm.tool_name === "Write" || perm.tool_name === "Edit") && input.file_path) {
        preview = String(input.file_path);
      } else {
        preview = JSON.stringify(input).slice(0, 100);
      }

      result.push({
        id: `approval-${perm.id}`,
        type: "approval",
        instanceId: perm.instance_id,
        instanceName: instance.name,
        title: `${perm.tool_name} permission request`,
        preview,
        timestamp: perm.requested_at,
        data: perm,
      });
    }

    // Scan messages for plans, questions, and completions
    const messagesByInstance = new Map<string, UiMessage[]>();
    for (const msg of messages) {
      const existing = messagesByInstance.get(msg.instance_id) || [];
      existing.push(msg);
      messagesByInstance.set(msg.instance_id, existing);
    }

    for (const [instanceId, instanceMessages] of messagesByInstance) {
      const instance = instanceMap.get(instanceId);
      if (!instance) continue;

      // Find the last assistant message for each instance
      const sortedMsgs = [...instanceMessages]
        .filter(m => m.role === "assistant" && !m.tool_name)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const lastAssistantMsg = sortedMsgs[0];
      if (!lastAssistantMsg) continue;

      // Check for plan files mentioned
      const planMatch = lastAssistantMsg.content.match(/\.claude\/plans\/[^\s]+\.md/);
      if (planMatch && instance.permission_mode === "plan") {
        result.push({
          id: `plan-${lastAssistantMsg.id}`,
          type: "plan",
          instanceId,
          instanceName: instance.name,
          title: "Execution plan ready for review",
          preview: lastAssistantMsg.content.slice(0, 150),
          timestamp: lastAssistantMsg.created_at,
        });
      }

      // Check for questions (only if instance is idle and last message was from assistant)
      if (instance.status === "idle" && isQuestionMessage(lastAssistantMsg)) {
        result.push({
          id: `question-${lastAssistantMsg.id}`,
          type: "question",
          instanceId,
          instanceName: instance.name,
          title: "Claude needs your input",
          preview: lastAssistantMsg.content.slice(0, 150),
          timestamp: lastAssistantMsg.created_at,
        });
      }

      // Check for completions
      if (instance.status === "idle" && isCompletionMessage(lastAssistantMsg)) {
        result.push({
          id: `completion-${lastAssistantMsg.id}`,
          type: "completion",
          instanceId,
          instanceName: instance.name,
          title: "Work completed",
          preview: lastAssistantMsg.content.slice(0, 150),
          timestamp: lastAssistantMsg.created_at,
        });
      }
    }

    // Sort by timestamp (most recent first)
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [instances, messages, pendingPermissions]);

  const approvals = items.filter(i => i.type === "approval");
  const plans = items.filter(i => i.type === "plan");
  const questions = items.filter(i => i.type === "question");
  const completions = items.filter(i => i.type === "completion");

  const currentItems = {
    approvals,
    plans,
    questions,
    completions,
  }[activeTab];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="md:hidden fixed inset-0 z-40 bg-black/60 animate-fade-in"
        onClick={onClose}
      />

      {/* Slide-up panel */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-hub-surface border-t border-hub-border rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-hub-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-hub-border">
          <h2 className="text-sm font-semibold">Inbox</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-hub-surface-2 text-hub-text-muted"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          <TabButton
            active={activeTab === "approvals"}
            count={approvals.length}
            label="Approvals"
            onClick={() => setActiveTab("approvals")}
          />
          <TabButton
            active={activeTab === "plans"}
            count={plans.length}
            label="Plans"
            onClick={() => setActiveTab("plans")}
          />
          <TabButton
            active={activeTab === "questions"}
            count={questions.length}
            label="Questions"
            onClick={() => setActiveTab("questions")}
          />
          <TabButton
            active={activeTab === "completions"}
            count={completions.length}
            label="Completed"
            onClick={() => setActiveTab("completions")}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {currentItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-hub-text-muted">
                No {activeTab} right now
              </p>
            </div>
          ) : (
            currentItems.map((item) => {
              if (item.type === "approval") {
                const permission = item.data as DbPendingPermission;
                return (
                  <ApprovalCard
                    key={item.id}
                    item={item}
                    permission={permission}
                    onApprove={() => onApprove(permission.id)}
                    onDeny={() => onDeny(permission.id)}
                  />
                );
              }
              if (item.type === "plan") {
                return <PlanCard key={item.id} item={item} />;
              }
              if (item.type === "question") {
                return <QuestionCard key={item.id} item={item} />;
              }
              if (item.type === "completion") {
                return <CompletionCard key={item.id} item={item} />;
              }
              return null;
            })
          )}
        </div>
      </div>
    </>
  );
}
