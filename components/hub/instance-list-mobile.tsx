"use client";
// ---------------------------------------------------------------------------
// InstanceListMobile — Mobile-optimized instance list (slide-up panel)
// ---------------------------------------------------------------------------

import { useState } from "react";
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

        {/* Instance list */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide py-2">
          {instances.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-hub-text-muted">
                No instances yet. Create your first one!
              </p>
            </div>
          ) : (
            instances.map((inst) => {
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
                  <StatusBadge
                    status={inst.status as InstanceStatus}
                    showLabel
                  />
                </Link>
              );
            })
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
      />
    </>
  );
}
