"use client";
// ---------------------------------------------------------------------------
// PlanViewer — Wraps FileViewer with auto-refresh while instance is running
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { FileViewer } from "./file-viewer";
import type { InstanceStatus } from "@/lib/types";

interface PlanViewerProps {
  instanceId: string;
  planPath: string;
  instanceStatus: InstanceStatus;
  onClose: () => void;
}

export function PlanViewer({
  instanceId,
  planPath,
  instanceStatus,
  onClose,
}: PlanViewerProps) {
  // Key is bumped to force a fresh FileViewer (re-fetches the file)
  const [refreshKey, setRefreshKey] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isActive = instanceStatus === "running" || instanceStatus === "queued";

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Poll every 10 seconds while instance is running
    intervalRef.current = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 10_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  return (
    <FileViewer
      key={refreshKey}
      instanceId={instanceId}
      filePath={planPath}
      onClose={onClose}
    />
  );
}
