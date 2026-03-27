"use client";
// ---------------------------------------------------------------------------
// useSwipeNavigation — DISABLED (was too glitchy on mobile)
// Keeping the hook interface for compatibility but not doing anything
// ---------------------------------------------------------------------------

import { useMemo } from "react";

export function useSwipeNavigation(
  instanceIds: string[],
  currentInstanceId: string | undefined
) {
  const { prevInstanceId, nextInstanceId } = useMemo(() => {
    const currentIndex = instanceIds.findIndex((id) => id === currentInstanceId);
    return {
      prevInstanceId: currentIndex > 0 ? instanceIds[currentIndex - 1] : null,
      nextInstanceId: currentIndex < instanceIds.length - 1 ? instanceIds[currentIndex + 1] : null,
    };
  }, [instanceIds, currentInstanceId]);

  // Swipe navigation disabled - was causing issues:
  // - Sometimes swiped to settings instead of next chat
  // - Glitchy/instant transitions without animation
  // - Some chats not showing after swipe
  // - Messages disappearing

  return {
    swipeState: { swiping: false, direction: null, offset: 0 },
    prevInstanceId,
    nextInstanceId,
    canSwipeLeft: false, // Disabled
    canSwipeRight: false, // Disabled
  };
}
