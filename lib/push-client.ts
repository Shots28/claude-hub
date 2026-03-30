// ---------------------------------------------------------------------------
// Claude Hub — Push Notification Client Helpers
// ---------------------------------------------------------------------------
// Browser-side utilities for requesting push permission and subscribing.
// ---------------------------------------------------------------------------

const PUSH_DENIED_KEY = "pushDenied";

// VAPID public key — safe to be in source code (it's public).
// Avoids NEXT_PUBLIC_ build-time inlining issues where turbopack
// fails to replace process.env in library files.
const VAPID_PUBLIC_KEY = "BC-jAqrxd2oHCz4CSk4XqElax_wPQH03HdbjaXtpkHIEALlXrMwknthmxAvjNZJZCGkUjWkfiHekqcqK4OkCTWU";

export function getVapidPublicKey(): string | undefined {
  // Prefer env var (for local dev flexibility), fall back to hardcoded
  return (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
    || VAPID_PUBLIC_KEY;
}

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
    const vapidPublicKey = getVapidPublicKey();

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
 * Returns { ok, error } so the UI can show what went wrong.
 */
export async function resubscribePush(): Promise<{ ok: boolean; error?: string }> {
  // Clear the denied flag so we can try again
  try {
    localStorage.removeItem(PUSH_DENIED_KEY);
  } catch { /* ignore */ }

  if (!("Notification" in window)) return { ok: false, error: "Notification API not available" };

  let perm = Notification.permission;
  if (perm !== "granted") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") {
    return { ok: false, error: `Permission: ${perm}` };
  }

  // Permission granted — try to subscribe
  try {
    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = getVapidPublicKey();

    if (!vapidPublicKey) {
      return { ok: false, error: "VAPID key not configured (build-time env missing)" };
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer;

    // Unsubscribe old
    const oldSub = await registration.pushManager.getSubscription();
    if (oldSub) {
      await oldSub.unsubscribe();
    }

    // Create fresh subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // Send to API
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `API ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
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
