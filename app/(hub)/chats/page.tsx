"use client";

export const dynamic = "force-dynamic";
// ---------------------------------------------------------------------------
// Chats Page — Full-page Slack-like chat navigation
// ---------------------------------------------------------------------------

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatView } from "@/components/hub/chat-view";
import { CreateInstanceModal } from "@/components/hub/create-instance-modal";
import { StatusBadge } from "@/components/hub/status-badge";
import { useHubRealtime } from "@/lib/hub-context";
import { useNeedsAttention } from "@/lib/use-needs-attention";
import type { DbInstance, InstanceStatus } from "@/lib/types";

function ChatsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const realtime = useHubRealtime();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Get instance ID from URL or select first instance
  useEffect(() => {
    const idFromUrl = searchParams?.get("id");
    if (idFromUrl) {
      setSelectedId(idFromUrl);
    } else if (realtime.instances.length > 0 && !selectedId) {
      setSelectedId(realtime.instances[0].id);
    }
  }, [searchParams, realtime.instances, selectedId]);

  // Track instances needing attention
  const { needsAttention, totalAttention, hasAttention } = useNeedsAttention(
    realtime.instances,
    realtime.pendingPermissions,
    selectedId || undefined
  );

  // Filter instances by search
  const filteredInstances = useMemo(() => {
    if (!search.trim()) return realtime.instances;
    const q = search.toLowerCase();
    return realtime.instances.filter((inst) =>
      inst.name.toLowerCase().includes(q) ||
      inst.repo_path.toLowerCase().includes(q)
    );
  }, [realtime.instances, search]);

  // Group by repo path for organization
  const groupedInstances = useMemo(() => {
    const groups = new Map<string, DbInstance[]>();
    for (const inst of filteredInstances) {
      const key = inst.repo_path;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inst);
    }
    return groups;
  }, [filteredInstances]);

  const selectedInstance = realtime.instances.find((i) => i.id === selectedId);

  const handleSelectInstance = useCallback((id: string) => {
    setSelectedId(id);
    router.push(`/chats?id=${id}`, { scroll: false });
  }, [router]);

  const handleRefresh = useCallback(() => {
    realtime.refreshInstances();
  }, [realtime]);

  return (
    <div className="flex h-full">
      {/* Left panel - Channel list (Slack-like) */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-hub-border bg-hub-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hub-border">
          <h1 className="text-base font-semibold">Chats</h1>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-hub-accent hover:bg-hub-accent-hover text-white transition-colors"
            aria-label="New chat"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-hub-border">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hub-text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-9 pr-3 py-2 bg-hub-surface-2 border border-hub-border rounded-lg text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-2 focus:ring-hub-accent/50 focus:border-hub-accent/50"
            />
          </div>
        </div>

        {/* Instance list */}
        <nav className="flex-1 overflow-y-auto py-2">
          {filteredInstances.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-hub-surface-2 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-hub-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className="text-sm text-hub-text-muted">
                {search.trim() ? "No matching chats" : "No chats yet"}
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm text-hub-accent hover:text-hub-accent-hover transition-colors"
              >
                Create your first chat
              </button>
            </div>
          ) : (
            Array.from(groupedInstances.entries()).map(([repoPath, instances]) => (
              <div key={repoPath} className="mb-3">
                {/* Repo header */}
                <div className="px-3 py-1.5 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-hub-text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="text-[11px] font-medium text-hub-text-muted/60 uppercase tracking-wider truncate">
                    {repoPath.split("/").pop()}
                  </span>
                </div>

                {/* Instances in this repo */}
                {instances.map((inst) => {
                  const isSelected = inst.id === selectedId;
                  const needsAtt = hasAttention(inst.id);
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => handleSelectInstance(inst.id)}
                      className={`w-full text-left px-3 py-2.5 mx-1.5 rounded-lg transition-all ${
                        isSelected
                          ? "bg-hub-accent/15 border border-hub-accent/30"
                          : "hover:bg-hub-surface-2 border border-transparent"
                      }`}
                      style={{ width: "calc(100% - 12px)" }}
                    >
                      <div className="flex items-center gap-2">
                        <StatusBadge status={inst.status as InstanceStatus} />
                        <span className={`text-sm font-medium truncate flex-1 ${
                          isSelected ? "text-hub-text" : "text-hub-text-muted"
                        }`}>
                          {inst.name}
                        </span>
                        {needsAtt && (
                          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                        )}
                      </div>
                      {inst.last_message_preview && (
                        <p className="text-xs text-hub-text-muted/60 truncate mt-1 pl-4">
                          {inst.last_message_preview}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </nav>

        {/* Footer with stats */}
        <div className="border-t border-hub-border px-4 py-2">
          <div className="text-[11px] text-hub-text-muted/60">
            {realtime.instances.length} chat{realtime.instances.length !== 1 ? "s" : ""}
            {totalAttention > 0 && (
              <span className="text-orange-400"> - {totalAttention} need attention</span>
            )}
          </div>
        </div>
      </div>

      {/* Right panel - Chat view */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedInstance ? (
          <ChatView
            instance={selectedInstance}
            messages={realtime.messages}
            pendingPermissions={realtime.pendingPermissions}
            connectionError={realtime.connectionError}
            onClearError={realtime.clearError}
            onSendMessage={realtime.sendMessage}
            onRetryMessage={realtime.retryMessage}
            onInterrupt={realtime.interrupt}
            onApprovePermission={realtime.approvePermission}
            onDenyPermission={realtime.denyPermission}
            onLoadMessages={realtime.loadMessages}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-hub-surface-2 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-hub-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-hub-text mb-2">Select a chat</h2>
              <p className="text-sm text-hub-text-muted mb-4">
                Choose a chat from the left panel or create a new one
              </p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-hub-accent hover:bg-hub-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
              >
                New Chat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateInstanceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(instanceId) => {
          handleRefresh();
          handleSelectInstance(instanceId);
        }}
        existingNames={realtime.instances.map((i) => i.name)}
      />
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function ChatsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-hub-text-muted">Loading...</div>}>
      <ChatsPageContent />
    </Suspense>
  );
}
