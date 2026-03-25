"use client";
// ---------------------------------------------------------------------------
// Hub Home — Redirect to first instance or show empty state
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateInstanceModal } from "@/components/hub/create-instance-modal";

export default function HubHomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/instances", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const instances = data.instances ?? data;
          if (Array.isArray(instances) && instances.length > 0) {
            // Redirect to the first (or first running) instance
            const running = instances.find(
              (i: { status: string }) => i.status === "running",
            );
            router.replace(
              `/instances/${running ? running.id : instances[0].id}`,
            );
            return;
          }
        }
      } catch {
        // Failed to fetch — show empty state
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-hub-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-hub-accent/10 border border-hub-accent/20 flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-8 h-8 text-hub-accent"
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
          </div>

          <h2 className="text-xl font-semibold text-hub-text mb-2">
            Welcome to Claude Hub
          </h2>
          <p className="text-sm text-hub-text-muted mb-6 leading-relaxed">
            Create your first Claude Code instance to get started. Each
            instance connects to a local repo and runs Claude Code on your
            behalf.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bg-hub-accent hover:bg-hub-accent-hover active:bg-blue-700 text-white font-medium rounded-xl px-6 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-hub-accent/50"
          >
            Create your first instance
          </button>
        </div>
      </div>

      <CreateInstanceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          // Refresh to redirect to the new instance
          router.refresh();
          setShowCreate(false);
        }}
      />
    </>
  );
}
