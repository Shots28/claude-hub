"use client";
// ---------------------------------------------------------------------------
// InstanceSidebar — Desktop sidebar showing instance list
// ---------------------------------------------------------------------------

import { useState } from "react";
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

export function InstanceSidebar({
  instances,
  activeId,
  onRefresh,
}: InstanceSidebarProps) {
  const [showCreate, setShowCreate] = useState(false);

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

        {/* Instance list */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide py-1">
          {instances.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-hub-text-muted">
                No instances yet
              </p>
            </div>
          ) : (
            instances.map((inst) => {
              const isActive = inst.id === activeId;
              return (
                <Link
                  key={inst.id}
                  href={`/instances/${inst.id}`}
                  className={`block mx-2 mb-0.5 rounded-lg px-3 py-2.5 transition-colors ${
                    isActive
                      ? "bg-hub-accent/10 border border-hub-accent/20"
                      : "hover:bg-hub-surface-2 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={inst.status as InstanceStatus}
                    />
                    <span
                      className={`text-sm font-medium truncate ${
                        isActive ? "text-hub-text" : "text-hub-text-muted"
                      }`}
                    >
                      {inst.name}
                    </span>
                  </div>
                  {inst.last_message_preview && (
                    <p className="text-xs text-hub-text-muted/60 truncate mt-1 pl-3.5">
                      {inst.last_message_preview}
                    </p>
                  )}
                </Link>
              );
            })
          )}
        </nav>

        {/* Resource monitor */}
        <ResourceMonitor />
      </aside>

      <CreateInstanceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={onRefresh}
      />
    </>
  );
}
