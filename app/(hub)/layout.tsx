"use client";
// ---------------------------------------------------------------------------
// Hub Layout — Sidebar (desktop) + Bottom Nav (mobile) + Realtime Provider
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { InstanceSidebar } from "@/components/hub/instance-sidebar";
import { InstanceListMobile } from "@/components/hub/instance-list-mobile";
import {
  HubRealtimeProvider,
  useHubRealtime,
} from "@/lib/hub-context";

function HubLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const realtime = useHubRealtime();
  const [mobileListOpen, setMobileListOpen] = useState(false);

  // Extract active instance ID from path
  const activeInstanceId = pathname.startsWith("/instances/")
    ? pathname.split("/")[2]
    : undefined;

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
    <div className="h-dvh flex flex-col md:flex-row overflow-hidden bg-hub-bg">
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

      {/* Mobile bottom nav */}
      <nav className="md:hidden flex-shrink-0 border-t border-hub-border bg-hub-surface">
        <div className="flex items-center justify-around h-14">
          {/* Instances tab */}
          <button
            type="button"
            onClick={() => setMobileListOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
              activeTab === "instances" && !activeInstanceId
                ? "text-hub-accent"
                : "text-hub-text-muted"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
            <span className="text-[10px] font-medium">Instances</span>
          </button>

          {/* Active / Chat tab */}
          <Link
            href={
              activeInstanceId
                ? `/instances/${activeInstanceId}`
                : realtime.instances.find((i) => i.status === "running")
                  ? `/instances/${realtime.instances.find((i) => i.status === "running")!.id}`
                  : realtime.instances[0]
                    ? `/instances/${realtime.instances[0].id}`
                    : "/"
            }
            className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
              activeTab === "active"
                ? "text-hub-accent"
                : "text-hub-text-muted"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
              />
            </svg>
            <span className="text-[10px] font-medium">Active</span>
          </Link>

          {/* Settings tab */}
          <Link
            href="/settings"
            className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
              activeTab === "settings"
                ? "text-hub-accent"
                : "text-hub-text-muted"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-[10px] font-medium">Settings</span>
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
