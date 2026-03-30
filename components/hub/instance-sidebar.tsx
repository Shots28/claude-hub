"use client";
// ---------------------------------------------------------------------------
// InstanceSidebar — Desktop sidebar showing instance list
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { ResourceMonitor } from "./resource-monitor";
import { CreateInstanceModal } from "./create-instance-modal";
import type { DbInstance, InstanceStatus } from "@/lib/types";

interface InstanceSidebarProps {
  instances: DbInstance[];
  activeId?: string;
  onRefresh: () => void;
}

function InstanceContextMenu({
  instanceId,
  onDelete,
  onRename,
  onClose,
  triggerElement,
}: {
  instanceId: string;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onClose: () => void;
  triggerElement: HTMLButtonElement | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position immediately from the trigger element
  const menuStyle = useMemo<React.CSSProperties>(() => {
    if (!triggerElement) return { position: 'fixed', top: 0, right: 0, zIndex: 9999 };

    const rect = triggerElement.getBoundingClientRect();
    const menuHeight = 80;
    const spaceBelow = window.innerHeight - rect.bottom;
    const positionAbove = spaceBelow < menuHeight + 20;

    return {
      position: 'fixed',
      right: window.innerWidth - rect.right,
      top: positionAbove ? rect.top - menuHeight - 4 : rect.bottom + 4,
      zIndex: 9999,
    };
  }, [triggerElement]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="w-32 bg-hub-surface-2 border border-hub-border rounded-lg shadow-lg py-1"
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRename(instanceId);
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-xs text-hub-text hover:bg-hub-surface transition-colors"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (confirm("Delete this instance? This cannot be undone.")) {
            onDelete(instanceId);
          }
          onClose();
        }}
        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}

export function InstanceSidebar({
  instances,
  activeId,
  onRefresh,
}: InstanceSidebarProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuTriggerRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

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

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/instances/${id}`, { method: "DELETE" });
      if (res.ok) {
        onRefresh();
      }
    } catch {
      // silently fail
    }
  };

  const handleRename = (id: string) => {
    const inst = instances.find((i) => i.id === id);
    if (inst) {
      setRenamingId(id);
      setRenameValue(inst.name);
    }
  };

  const submitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      const res = await fetch(`/api/instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        onRefresh();
      }
    } catch {
      // silently fail
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
  };

  return (
    <>
      <aside className="hidden md:flex w-[260px] flex-col border-r border-hub-border bg-hub-surface h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hub-border">
          <h2 className="text-sm font-semibold tracking-tight">
            Claude Hub
          </h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-hub-surface-2 text-hub-text-muted hover:text-hub-text transition-colors"
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
        <div className="px-3 py-2 border-b border-hub-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instances..."
            className="w-full bg-hub-surface-2 border border-hub-border rounded-lg px-3 py-1.5 text-xs text-hub-text placeholder-hub-text-muted/50 focus:outline-none focus:ring-1 focus:ring-hub-accent/50 focus:border-hub-accent/50 transition-colors"
          />
        </div>

        {/* Instance list */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide py-1">
          {filteredInstances.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-hub-text-muted">
                {search.trim() ? "No matching instances" : "No instances yet"}
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
                    <div key={inst.id} className="relative group mx-2 mb-0.5">
                      <Link
                        href={`/instances/${inst.id}`}
                        className={`block rounded-lg px-3 py-2.5 transition-colors ${
                          isActive
                            ? "bg-hub-accent/10 border border-hub-accent/20"
                            : "hover:bg-hub-surface-2 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            status={inst.status as InstanceStatus}
                          />
                          {renamingId === inst.id ? (
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  submitRename(inst.id);
                                } else if (e.key === "Escape") {
                                  cancelRename();
                                }
                              }}
                              onBlur={() => submitRename(inst.id)}
                              onClick={(e) => e.preventDefault()}
                              autoFocus
                              className="text-sm font-medium truncate flex-1 bg-hub-surface-2 border border-hub-accent/50 rounded px-1.5 py-0.5 text-hub-text focus:outline-none focus:ring-1 focus:ring-hub-accent/50"
                            />
                          ) : (
                            <span
                              className={`text-sm font-medium truncate flex-1 ${
                                isActive ? "text-hub-text" : "text-hub-text-muted"
                              }`}
                            >
                              {inst.name}
                            </span>
                          )}
                        </div>
                        {inst.last_message_preview && (
                          <p className="text-xs text-hub-text-muted/60 truncate mt-1 pl-3.5">
                            {inst.last_message_preview}
                          </p>
                        )}
                      </Link>

                      {/* Context menu trigger */}
                      <button
                        ref={(el) => { menuTriggerRefs.current.set(inst.id, el); }}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === inst.id ? null : inst.id);
                        }}
                        className="absolute right-2 top-2.5 w-6 h-6 flex items-center justify-center rounded-md opacity-50 hover:opacity-100 hover:bg-hub-border text-hub-text-muted hover:text-hub-text transition-all focus:outline-none"
                        aria-label="Instance options"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>

                      {menuOpenId === inst.id && (
                        <InstanceContextMenu
                          instanceId={inst.id}
                          onDelete={handleDelete}
                          onRename={handleRename}
                          onClose={() => setMenuOpenId(null)}
                          triggerElement={menuTriggerRefs.current.get(inst.id) ?? null}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </nav>

        {/* Resource monitor */}
        <ResourceMonitor />
      </aside>

      <CreateInstanceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(instanceId) => {
          onRefresh();
          window.location.href = `/instances/${instanceId}`;
        }}
        existingNames={instances.map((i) => i.name)}
      />
    </>
  );
}
