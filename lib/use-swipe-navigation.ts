"use client";
// ---------------------------------------------------------------------------
// useSwipeNavigation — Horizontal swipe gesture for navigating between instances
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface SwipeConfig {
  threshold?: number;      // minimum distance to trigger swipe (default: 80px)
  velocity?: number;       // minimum velocity to trigger (default: 0.3)
  edgeWidth?: number;      // width of edge trigger zone (default: 30px)
}

interface SwipeState {
  swiping: boolean;
  direction: "left" | "right" | null;
  offset: number;
}

export function useSwipeNavigation(
  instanceIds: string[],
  currentInstanceId: string | undefined,
  config: SwipeConfig = {}
) {
  const { threshold = 80, velocity = 0.3, edgeWidth = 30 } = config;
  const router = useRouter();
  const [swipeState, setSwipeState] = useState<SwipeState>({
    swiping: false,
    direction: null,
    offset: 0,
  });

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const isEdgeSwipeRef = useRef(false);

  const currentIndex = instanceIds.findIndex((id) => id === currentInstanceId);
  const prevInstanceId = currentIndex > 0 ? instanceIds[currentIndex - 1] : null;
  const nextInstanceId = currentIndex < instanceIds.length - 1 ? instanceIds[currentIndex + 1] : null;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    const x = touch.clientX;

    // Only track edge swipes to avoid conflict with scrolling
    const isLeftEdge = x < edgeWidth;
    const isRightEdge = x > window.innerWidth - edgeWidth;
    isEdgeSwipeRef.current = isLeftEdge || isRightEdge;

    if (!isEdgeSwipeRef.current) return;

    touchStartRef.current = { x, y: touch.clientY, time: Date.now() };
    touchCurrentRef.current = { x, y: touch.clientY };
  }, [edgeWidth]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current || !isEdgeSwipeRef.current) return;

    const touch = e.touches[0];
    touchCurrentRef.current = { x: touch.clientX, y: touch.clientY };

    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // If vertical movement is dominant, cancel the swipe
    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      touchStartRef.current = null;
      setSwipeState({ swiping: false, direction: null, offset: 0 });
      return;
    }

    const direction = dx > 0 ? "right" : "left";
    const canSwipe = direction === "right" ? !!prevInstanceId : !!nextInstanceId;

    if (canSwipe && Math.abs(dx) > 10) {
      // Prevent vertical scroll while swiping
      e.preventDefault();
      setSwipeState({
        swiping: true,
        direction,
        offset: Math.min(Math.abs(dx), window.innerWidth * 0.4) * (dx > 0 ? 1 : -1),
      });
    }
  }, [prevInstanceId, nextInstanceId]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !touchCurrentRef.current || !isEdgeSwipeRef.current) {
      setSwipeState({ swiping: false, direction: null, offset: 0 });
      return;
    }

    const dx = touchCurrentRef.current.x - touchStartRef.current.x;
    const dt = Date.now() - touchStartRef.current.time;
    const v = Math.abs(dx) / dt;

    const shouldNavigate = Math.abs(dx) > threshold || v > velocity;
    const direction = dx > 0 ? "right" : "left";
    const targetId = direction === "right" ? prevInstanceId : nextInstanceId;

    if (shouldNavigate && targetId) {
      router.push(`/instances/${targetId}`);
    }

    touchStartRef.current = null;
    touchCurrentRef.current = null;
    isEdgeSwipeRef.current = false;
    setSwipeState({ swiping: false, direction: null, offset: 0 });
  }, [threshold, velocity, prevInstanceId, nextInstanceId, router]);

  useEffect(() => {
    // Add passive: false to allow preventDefault on touchmove
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    swipeState,
    prevInstanceId,
    nextInstanceId,
    canSwipeLeft: !!nextInstanceId,
    canSwipeRight: !!prevInstanceId,
  };
}
