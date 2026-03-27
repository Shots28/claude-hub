"use client";
// ---------------------------------------------------------------------------
// useSwipeNavigation — Lightweight horizontal swipe for navigating instances
// Optimized for performance - uses refs to avoid re-renders during gestures
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

interface SwipeState {
  swiping: boolean;
  direction: "left" | "right" | null;
  offset: number;
}

const EDGE_WIDTH = 25;
const THRESHOLD = 80;

export function useSwipeNavigation(
  instanceIds: string[],
  currentInstanceId: string | undefined
) {
  const router = useRouter();
  const [swipeState, setSwipeState] = useState<SwipeState>({
    swiping: false,
    direction: null,
    offset: 0,
  });

  // Use refs to avoid recreating event handlers
  const stateRef = useRef({ startX: 0, startY: 0, startTime: 0, isEdge: false });

  const { prevInstanceId, nextInstanceId } = useMemo(() => {
    const currentIndex = instanceIds.findIndex((id) => id === currentInstanceId);
    return {
      prevInstanceId: currentIndex > 0 ? instanceIds[currentIndex - 1] : null,
      nextInstanceId: currentIndex < instanceIds.length - 1 ? instanceIds[currentIndex + 1] : null,
    };
  }, [instanceIds, currentInstanceId]);

  // Store in ref so event handlers don't need to be recreated
  const navRef = useRef({ prevInstanceId, nextInstanceId, router });
  navRef.current = { prevInstanceId, nextInstanceId, router };

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const x = touch.clientX;
      const isEdge = x < EDGE_WIDTH || x > window.innerWidth - EDGE_WIDTH;

      stateRef.current = {
        startX: x,
        startY: touch.clientY,
        startTime: Date.now(),
        isEdge,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const state = stateRef.current;
      if (!state.isEdge) return;

      const touch = e.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      // Cancel if vertical movement dominates
      if (Math.abs(dy) > Math.abs(dx) * 1.5) {
        state.isEdge = false;
        setSwipeState({ swiping: false, direction: null, offset: 0 });
        return;
      }

      const direction = dx > 0 ? "right" : "left";
      const { prevInstanceId, nextInstanceId } = navRef.current;
      const canSwipe = direction === "right" ? !!prevInstanceId : !!nextInstanceId;

      if (canSwipe && Math.abs(dx) > 10) {
        setSwipeState({
          swiping: true,
          direction,
          offset: Math.min(Math.abs(dx), 120) * (dx > 0 ? 1 : -1),
        });
      }
    };

    const handleTouchEnd = () => {
      const state = stateRef.current;
      if (!state.isEdge) {
        setSwipeState({ swiping: false, direction: null, offset: 0 });
        return;
      }

      // Reset state
      state.isEdge = false;
      setSwipeState({ swiping: false, direction: null, offset: 0 });
    };

    // Use passive listeners for better scroll performance
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []); // Empty deps - handlers use refs

  return {
    swipeState,
    prevInstanceId,
    nextInstanceId,
    canSwipeLeft: !!nextInstanceId,
    canSwipeRight: !!prevInstanceId,
  };
}
