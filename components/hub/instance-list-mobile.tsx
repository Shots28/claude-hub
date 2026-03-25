"use client";
// ---------------------------------------------------------------------------
// InstanceListMobile — Mobile-optimized instance list (slide-up panel)
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { CreateInstanceModal } from "./create-instance-modal";
import type { DbInstance, InstanceStatus } from "@/lib/types";

interface InstanceListMobileProps {
  instances: DbInstance[];
  activeId?: string;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function InstanceListMobile({
  instances,
  activeId,
  open,
  onClose,
  onRefresh,
}: InstanceListMobileProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const filteredInstances = useMemo(() => {
    if (!search.trim()) return instances;
    const q = search.toLowerCase();
    return instances.filter((inst) => inst.name.toLowerCase().includes(q));
  }, [instances, search]);

  const groupedInstances = useMemo(() => {
    const groups = new Map<string, typeof filteredInstances>();
    for (const inst of filteredInstances) {
      const key = inst.repo_path;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inst);
    }
    return groups;
  }, [filteredInstances]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="md:hidden fixed inset-0 z-40 bg-black/60 animate-fade-in"
        onClick={onClose}
      />

      {/* Slide-up panel */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-hub-surface border-t border-hub-border rounded-t-2xl max-h-[75vh] flex flex-col animate-slide-up">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-hub-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-hub-border">
          <h2 className="text-sm font-semibold">Instances</h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-hub-accent text-white"
            aria-label="New instance"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 py-2 border-b border-hub-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instances..."
            className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-2 text-sm text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-1 focus:ring-hub-accent/50 focus:border-hub-accent/50 transition-colors"
          />
        </div>

        {/* Instance list */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide py-2">
          {filteredInstances.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-hub-text-muted">
                {search.trim()
                  ? "No matching instances"
                  : "No instances yet. Create your first one!"}
              </p>
            </div>
          ) : (
            Array.from(groupedInstances.entries()).map(([repoPath, insts]) => (
              <div key={repoPath}>
                <div className="px-4 py-1.5 text-[10px] font-medium text-hub-text-muted/60 uppercase tracking-wider">
                  {repoPath.split("/").pop()}
                </div>
                {insts.map((inst) => {
                  const isActive = inst.id === activeId;
                  return (
                    <Link
                      key={inst.id}
                      href={`/instances/${inst.id}`}
                      onClick={onClose}
                      className={`flex items-center gap-3 mx-2 mb-0.5 rounded-xl px-4 py-3 transition-colors ${
                        isActive
                          ? "bg-hub-accent/10"
                          : "hover:bg-hub-surface-2 active:bg-hub-surface-2"
                      }`}
                    >
                      <StatusBadge
                        status={inst.status as InstanceStatus}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium truncate ${
                            isActive
                              ? "text-hub-text"
                              : "text-hub-text-muted"
                          }`}
                        >
                          {inst.name}
                        </div>
                        {inst.last_message_preview && (
                          <p className="text-xs text-hub-text-muted/60 truncate mt-0.5">
                            {inst.last_message_preview}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))
          )}
        </nav>
      </div>

      <CreateInstanceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          onRefresh();
          onClose();
        }}
        existingNames={instances.map((i) => i.name)}
      />
    </>
  );
}
