"use client";
// ---------------------------------------------------------------------------
// Hub Layout — Sidebar (desktop) + Bottom Nav (mobile) + Realtime Provider
// ---------------------------------------------------------------------------

// Force dynamic rendering to avoid SSR context issues
export const dynamic = "force-dynamic";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { InstanceSidebar } from "@/components/hub/instance-sidebar";
import { CreateInstanceModal } from "@/components/hub/create-instance-modal";
import {
  HubRealtimeProvider,
  useHubRealtime,
} from "@/lib/hub-context";
import { useNeedsAttention } from "@/lib/use-needs-attention";

function HubLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const realtime = useHubRealtime();
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);

  // Extract active instance ID from path
  const activeInstanceId = pathname?.startsWith("/instances/")
    ? pathname.split("/")[2]
    : undefined;

  // Track instances needing attention (completed or permission pending)
  const { totalAttention } = useNeedsAttention(
    realtime.instances,
    realtime.pendingPermissions,
    activeInstanceId
  );

  // Determine active bottom nav tab
  const activeTab = pathname?.startsWith("/settings")
    ? "settings"
    : pathname?.startsWith("/instances")
      ? "active"
      : "instances";

  const handleRefresh = useCallback(() => {
    realtime.refreshInstances();
  }, [realtime]);

  return (
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden bg-hub-bg pt-safe">
      {/* Desktop sidebar */}
      <InstanceSidebar
        instances={realtime.instances}
        activeId={activeInstanceId}
        onRefresh={handleRefresh}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>

      {/* Mobile bottom nav - Large touch targets (44pt minimum per Apple HIG) */}
      <nav className="md:hidden flex-shrink-0 border-t border-hub-border bg-hub-bg pb-safe">
        <div className="flex items-center justify-around h-16 px-4">
          {/* Chats */}
          <Link
            href="/chats"
            className={`relative flex flex-col items-center justify-center min-w-[64px] h-14 px-3 rounded-2xl transition-all active:scale-95 ${
              pathname?.startsWith("/chats")
                ? "bg-hub-accent text-white"
                : "text-hub-text-muted active:bg-hub-surface-2"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            <span className="text-[11px] font-medium mt-1">Chats</span>
            {totalAttention > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                {totalAttention > 9 ? "9+" : totalAttention}
              </span>
            )}
          </Link>

          {/* New Instance - prominent center button */}
          <button
            type="button"
            onClick={() => setMobileCreateOpen(true)}
            className="flex items-center justify-center w-14 h-14 rounded-2xl bg-hub-accent hover:bg-hub-accent-hover active:scale-95 transition-all shadow-lg"
          >
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>

          {/* Settings */}
          <Link
            href="/settings"
            className={`flex flex-col items-center justify-center min-w-[64px] h-14 px-3 rounded-2xl transition-all active:scale-95 ${
              activeTab === "settings"
                ? "bg-hub-accent text-white"
                : "text-hub-text-muted active:bg-hub-surface-2"
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[11px] font-medium mt-1">Settings</span>
          </Link>
        </div>
      </nav>

      {/* Mobile create instance modal */}
      <CreateInstanceModal
        open={mobileCreateOpen}
        onClose={() => setMobileCreateOpen(false)}
        onCreated={(instanceId) => {
          handleRefresh();
          window.location.href = `/instances/${instanceId}`;
        }}
        existingNames={realtime.instances.map((i) => i.name)}
      />
    </div>
  );
}

export default function HubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HubRealtimeProvider>
      <HubLayoutInner>{children}</HubLayoutInner>
    </HubRealtimeProvider>
  );
}
