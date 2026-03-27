"use client";
// ---------------------------------------------------------------------------
// InstanceListMobile — Mobile-optimized instance list (slide-up panel)
// Supports manual sorting with drag-and-drop
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
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
  needsAttention?: Record<string, "permission" | "completed">;
}

// Drag handle for reordering
function DragHandle({ onDragStart }: { onDragStart: (e: React.TouchEvent | React.MouseEvent) => void }) {
  return (
    <div
      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-hub-text-muted cursor-grab active:cursor-grabbing touch-none"
      onTouchStart={onDragStart}
      onMouseDown={onDragStart}
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <rect x="9" y="5" width="2" height="2" rx="1" />
        <rect x="13" y="5" width="2" height="2" rx="1" />
        <rect x="9" y="9" width="2" height="2" rx="1" />
        <rect x="13" y="9" width="2" height="2" rx="1" />
        <rect x="9" y="13" width="2" height="2" rx="1" />
        <rect x="13" y="13" width="2" height="2" rx="1" />
        <rect x="9" y="17" width="2" height="2" rx="1" />
        <rect x="13" y="17" width="2" height="2" rx="1" />
      </svg>
    </div>
  );
}

function MobileActionMenu({
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
    const menuHeight = 90;
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
        className="w-full text-left px-3 py-2 text-sm text-hub-text hover:bg-hub-surface transition-colors"
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
        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}

export function InstanceListMobile({
  instances,
  activeId,
  open,
  onClose,
  onRefresh,
  needsAttention = {},
}: InstanceListMobileProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const menuTriggerRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);

  // Initialize local order from instances
  useEffect(() => {
    const sorted = [...instances]
      .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
      .map(i => i.id);
    setLocalOrder(sorted);
  }, [instances]);

  // Save new order to backend
  const saveOrder = useCallback(async (newOrder: string[]) => {
    try {
      // Update sort_order for each instance
      await Promise.all(
        newOrder.map((id, index) =>
          fetch(`/api/instances/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: index }),
          })
        )
      );
      onRefresh();
    } catch {
      // silently fail
    }
  }, [onRefresh]);

  // Handle drag reorder
  const handleDragStart = useCallback((instanceId: string) => (e: React.TouchEvent | React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(instanceId);
  }, [editMode]);

  const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!draggingId || !listRef.current) return;

    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const listRect = listRef.current.getBoundingClientRect();
    const relativeY = clientY - listRect.top;

    // Find the target position
    const items = listRef.current.querySelectorAll("[data-instance-id]");
    let targetIndex = localOrder.indexOf(draggingId);

    items.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const itemMiddle = rect.top + rect.height / 2 - listRect.top;
      if (relativeY > itemMiddle) {
        targetIndex = index + 1;
      }
    });

    // Reorder if needed
    const currentIndex = localOrder.indexOf(draggingId);
    if (targetIndex !== currentIndex && targetIndex >= 0) {
      const newOrder = [...localOrder];
      newOrder.splice(currentIndex, 1);
      newOrder.splice(targetIndex > currentIndex ? targetIndex - 1 : targetIndex, 0, draggingId);
      setLocalOrder(newOrder);
    }
  }, [draggingId, localOrder]);

  const handleDragEnd = useCallback(() => {
    if (draggingId) {
      saveOrder(localOrder);
      setDraggingId(null);
    }
  }, [draggingId, localOrder, saveOrder]);

  // Global event listeners for drag
  useEffect(() => {
    if (!draggingId) return;

    const onMove = (e: TouchEvent | MouseEvent) => handleDragMove(e);
    const onEnd = () => handleDragEnd();

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchend", onEnd);
    document.addEventListener("mouseup", onEnd);

    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("mouseup", onEnd);
    };
  }, [draggingId, handleDragMove, handleDragEnd]);

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

  // Get instances in the correct order
  const orderedInstances = useMemo(() => {
    const instanceMap = new Map(instances.map(i => [i.id, i]));
    return localOrder
      .map(id => instanceMap.get(id))
      .filter((i): i is DbInstance => i !== undefined);
  }, [instances, localOrder]);

  const filteredInstances = useMemo(() => {
    if (!search.trim()) return orderedInstances;
    const q = search.toLowerCase();
    return orderedInstances.filter((inst) => inst.name.toLowerCase().includes(q));
  }, [orderedInstances, search]);

  // In edit mode, show flat list; otherwise group by repo
  const groupedInstances = useMemo(() => {
    if (editMode) {
      // Flat list in edit mode for easier reordering
      return new Map([["all", filteredInstances]]);
    }
    const groups = new Map<string, typeof filteredInstances>();
    for (const inst of filteredInstances) {
      const key = inst.repo_path;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inst);
    }
    return groups;
  }, [filteredInstances, editMode]);

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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Instances</h2>
            {/* Edit/Done toggle for sorting */}
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                editMode
                  ? "bg-hub-accent text-white"
                  : "bg-hub-surface-2 text-hub-text-muted hover:text-hub-text"
              }`}
            >
              {editMode ? "Done" : "Edit"}
            </button>
          </div>
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
        <nav ref={listRef} className="flex-1 overflow-y-auto scrollbar-hide py-2">
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
                {!editMode && repoPath !== "all" && (
                  <div className="px-4 py-1.5 text-[10px] font-medium text-hub-text-muted/60 uppercase tracking-wider">
                    {repoPath.split("/").pop()}
                  </div>
                )}
                {insts.map((inst) => {
                  const isActive = inst.id === activeId;
                  const isDragging = inst.id === draggingId;
                  return (
                    <div
                      key={inst.id}
                      data-instance-id={inst.id}
                      className={`relative mx-2 mb-0.5 ${isDragging ? "opacity-50 scale-95" : ""} transition-all`}
                    >
                      <Link
                        href={editMode ? "#" : `/instances/${inst.id}`}
                        onClick={(e) => {
                          if (editMode) {
                            e.preventDefault();
                            return;
                          }
                          onClose();
                        }}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
                          isActive
                            ? "bg-hub-accent/10"
                            : "hover:bg-hub-surface-2 active:bg-hub-surface-2"
                        } ${editMode ? "cursor-default" : ""}`}
                      >
                        {/* Drag handle in edit mode */}
                        {editMode && (
                          <DragHandle onDragStart={handleDragStart(inst.id)} />
                        )}
                        <StatusBadge
                          status={inst.status as InstanceStatus}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
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
                              className="text-sm font-medium truncate w-full bg-hub-surface-2 border border-hub-accent/50 rounded px-1.5 py-0.5 text-hub-text focus:outline-none focus:ring-1 focus:ring-hub-accent/50"
                            />
                          ) : (
                            <div
                              className={`text-sm font-medium truncate ${
                                isActive
                                  ? "text-hub-text"
                                  : "text-hub-text-muted"
                              }`}
                            >
                              {inst.name}
                            </div>
                          )}
                          {inst.last_message_preview && (
                            <p className="text-xs text-hub-text-muted/60 truncate mt-0.5">
                              {inst.last_message_preview}
                            </p>
                          )}
                        </div>

                        {/* Attention indicator */}
                        {needsAttention[inst.id] && (
                          <span className={`flex-shrink-0 h-5 flex items-center justify-center rounded-full text-[10px] font-medium text-white px-2 ${
                            needsAttention[inst.id] === "permission"
                              ? "bg-orange-500"
                              : "bg-emerald-500"
                          }`}>
                            {needsAttention[inst.id] === "permission" ? "Action" : "Done"}
                          </span>
                        )}

                        {/* More actions button */}
                        <button
                          ref={(el) => { menuTriggerRefs.current.set(inst.id, el); }}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === inst.id ? null : inst.id);
                          }}
                          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-hub-border text-hub-text-muted hover:text-hub-text transition-all focus:outline-none"
                          aria-label="Instance options"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                      </Link>

                      {menuOpenId === inst.id && (
                        <MobileActionMenu
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
      </div>

      <CreateInstanceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(instanceId) => {
          onRefresh();
          onClose();
          window.location.href = `/instances/${instanceId}`;
        }}
        existingNames={instances.map((i) => i.name)}
      />
    </>
  );
}
