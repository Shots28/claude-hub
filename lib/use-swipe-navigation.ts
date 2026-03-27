"use client";
// ---------------------------------------------------------------------------
// useSwipeNavigation — Minimal edge swipe detection
// Only activates on deliberate edge swipes, never interferes with normal taps
// ---------------------------------------------------------------------------

import { useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";

const EDGE_WIDTH = 20;
const MIN_SWIPE_DISTANCE = 100;
const MAX_VERTICAL_RATIO = 0.5; // Must be mostly horizontal

export function useSwipeNavigation(
  instanceIds: string[],
  currentInstanceId: string | undefined
) {
  const router = useRouter();

  const { prevInstanceId, nextInstanceId } = useMemo(() => {
    const currentIndex = instanceIds.findIndex((id) => id === currentInstanceId);
    return {
      prevInstanceId: currentIndex > 0 ? instanceIds[currentIndex - 1] : null,
      nextInstanceId: currentIndex < instanceIds.length - 1 ? instanceIds[currentIndex + 1] : null,
    };
  }, [instanceIds, currentInstanceId]);

  // Store navigation targets in ref for stable event handlers
  const navRef = useRef({ prevInstanceId, nextInstanceId, router });
  navRef.current = { prevInstanceId, nextInstanceId, router };

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let isEdgeTouch = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const x = touch.clientX;

      // Only track if starting from very edge of screen
      isEdgeTouch = x < EDGE_WIDTH || x > window.innerWidth - EDGE_WIDTH;
      if (isEdgeTouch) {
        startX = x;
        startY = touch.clientY;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isEdgeTouch) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);

      // Reset
      isEdgeTouch = false;

      // Check if this was a deliberate horizontal swipe
      if (Math.abs(dx) < MIN_SWIPE_DISTANCE) return;
      if (dy > Math.abs(dx) * MAX_VERTICAL_RATIO) return;

      const { prevInstanceId, nextInstanceId, router } = navRef.current;

      if (dx > 0 && prevInstanceId) {
        // Swiped right from left edge -> go to previous
        router.push(`/instances/${prevInstanceId}`);
      } else if (dx < 0 && nextInstanceId) {
        // Swiped left from right edge -> go to next
        router.push(`/instances/${nextInstanceId}`);
      }
    };

    // All passive - we never prevent default, just detect gestures
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return {
    swipeState: { swiping: false, direction: null, offset: 0 }, // No visual feedback to avoid re-renders
    prevInstanceId,
    nextInstanceId,
    canSwipeLeft: !!nextInstanceId,
    canSwipeRight: !!prevInstanceId,
  };
}
