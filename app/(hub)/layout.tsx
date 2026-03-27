"use client";
// ---------------------------------------------------------------------------
// Hub Layout — Sidebar (desktop) + Bottom Nav (mobile) + Realtime Provider
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { InstanceSidebar } from "@/components/hub/instance-sidebar";
import { InstanceListMobile } from "@/components/hub/instance-list-mobile";
import { CreateInstanceModal } from "@/components/hub/create-instance-modal";
import {
  HubRealtimeProvider,
  useHubRealtime,
} from "@/lib/hub-context";
import { useNeedsAttention } from "@/lib/use-needs-attention";

function HubLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const realtime = useHubRealtime();
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);

  // Extract active instance ID from path
  const activeInstanceId = pathname.startsWith("/instances/")
    ? pathname.split("/")[2]
    : undefined;

  // Track instances needing attention (completed or permission pending)
  const { needsAttention, totalAttention } = useNeedsAttention(
    realtime.instances,
    realtime.pendingPermissions,
    activeInstanceId
  );

  // Determine active bottom nav tab
  const activeTab = pathname.startsWith("/settings")
    ? "settings"
    : pathname.startsWith("/instances")
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

      {/* Mobile bottom nav - Clean and minimal */}
      <nav className="md:hidden flex-shrink-0 border-t border-hub-border bg-hub-bg safe-area-bottom">
        <div className="flex items-center justify-around h-12 max-w-md mx-auto px-4">
          {/* Instances tab */}
          <button
            type="button"
            onClick={() => setMobileListOpen(true)}
            className={`relative flex items-center justify-center gap-2 h-10 px-4 rounded-full transition-all ${
              mobileListOpen
                ? "bg-hub-accent/15 text-hub-accent"
                : "text-hub-text-muted hover:text-hub-text active:bg-hub-surface-2"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
            <span className="text-xs font-medium">Chats</span>
            {totalAttention > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                {totalAttention > 9 ? "9+" : totalAttention}
              </span>
            )}
          </button>

          {/* New Instance - prominent center button */}
          <button
            type="button"
            onClick={() => setMobileCreateOpen(true)}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-hub-accent hover:bg-hub-accent-hover active:scale-95 transition-all shadow-lg"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>

          {/* Settings tab */}
          <Link
            href="/settings"
            className={`flex items-center justify-center gap-2 h-10 px-4 rounded-full transition-all ${
              activeTab === "settings"
                ? "bg-hub-accent/15 text-hub-accent"
                : "text-hub-text-muted hover:text-hub-text active:bg-hub-surface-2"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs font-medium">Settings</span>
          </Link>
        </div>
      </nav>

      {/* Mobile instance list panel */}
      <InstanceListMobile
        instances={realtime.instances}
        activeId={activeInstanceId}
        open={mobileListOpen}
        onClose={() => setMobileListOpen(false)}
        onRefresh={handleRefresh}
        needsAttention={needsAttention}
      />

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
