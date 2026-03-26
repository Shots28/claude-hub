"use client";
// ---------------------------------------------------------------------------
// SwRegister — Client component that registers the service worker
// ---------------------------------------------------------------------------
// Must be a "use client" component because it uses browser APIs (navigator).
// Included in the root layout as a child of the Server Component.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    // Register the service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[sw] Service worker registered, scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[sw] Service worker registration failed:", err);
      });

    // Listen for navigation messages from the SW (notificationclick handler)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "navigate" && event.data.url) {
        // Use window.location.href for reliable cross-page navigation
        // (Next.js router may not be available in this context)
        window.location.href = event.data.url;
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  // This component renders nothing — it's purely for side effects
  return null;
}
