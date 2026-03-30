// ---------------------------------------------------------------------------
// Claude Hub — Push Notification Client Helpers
// ---------------------------------------------------------------------------
// Browser-side utilities for requesting push permission and subscribing.
// ---------------------------------------------------------------------------

const PUSH_DENIED_KEY = "pushDenied";

/**
 * Check if the user has permanently dismissed push notifications.
 */
export function isPushDenied(): boolean {
  try {
    return localStorage.getItem(PUSH_DENIED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Mark push as permanently denied in localStorage.
 */
export function markPushDenied(): void {
  try {
    localStorage.setItem(PUSH_DENIED_KEY, "true");
  } catch {
    // Storage unavailable — silently ignore
  }
}

/**
 * Subscribe the current service worker push subscription to the server.
 * If forceNew is true, unsubscribes the old subscription first (needed
 * when VAPID keys change or the subscription expires).
 */
export async function subscribeToPush(forceNew = false): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
      console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — skipping push subscription");
      return false;
    }

    // Convert VAPID public key from base64url to ArrayBuffer
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer;

    let subscription = await registration.pushManager.getSubscription();

    // If forcing a new subscription, unsubscribe the old one first
    if (subscription && forceNew) {
      console.log("[push] Unsubscribing old subscription for re-subscribe");
      await subscription.unsubscribe();
      subscription = null;
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    // Send subscription to our API
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!res.ok) {
      console.error("[push] Failed to store subscription:", res.status);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[push] Subscribe failed:", err);
    return false;
  }
}

/**
 * Request push notification permission, then subscribe if granted.
 * Returns true if permission was granted and subscription succeeded.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (isPushDenied()) return false;

  if (!("Notification" in window)) return false;

  if (Notification.permission === "granted") {
    return subscribeToPush();
  }

  if (Notification.permission === "denied") {
    markPushDenied();
    return false;
  }

  // Permission is "default" — request it
  const result = await Notification.requestPermission();

  if (result === "granted") {
    return subscribeToPush();
  }

  if (result === "denied") {
    markPushDenied();
  }

  return false;
}

/**
 * Re-subscribe to push notifications. Clears the "denied" flag,
 * unsubscribes the old push subscription, and creates a fresh one.
 * Use when VAPID keys change or the subscription expires.
 */
export async function resubscribePush(): Promise<boolean> {
  // Clear the denied flag so we can try again
  try {
    localStorage.removeItem(PUSH_DENIED_KEY);
  } catch { /* ignore */ }

  if (!("Notification" in window)) return false;

  if (Notification.permission === "granted") {
    return subscribeToPush(true); // force new subscription
  }

  // Permission not granted — request it fresh
  const result = await Notification.requestPermission();
  if (result === "granted") {
    return subscribeToPush(true);
  }

  return false;
}

/**
 * Convert a base64url-encoded string to a Uint8Array.
 * Used to convert the VAPID public key for the PushManager.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
