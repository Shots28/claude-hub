// ---------------------------------------------------------------------------
// Claude Hub — Push Notification Server Utilities
// ---------------------------------------------------------------------------
// Wrapper around the web-push npm package. Used by API routes only.
// ---------------------------------------------------------------------------

import webpush from "web-push";

let vapidConfigured = false;

/**
 * Ensure VAPID details are set. Called lazily on first use.
 */
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn(
      "[push-server] Missing VAPID env vars (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)"
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  instanceId?: string;
  tag?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false on failure.
 * Throws a "gone" error (410) if the subscription is expired — caller should delete it.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<{ success: boolean; gone: boolean }> {
  if (!ensureVapidConfigured()) {
    return { success: false, gone: false };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
      {
        TTL: 60 * 60, // 1 hour TTL
        urgency: "high",
      }
    );
    return { success: true, gone: false };
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or invalid — caller should clean up
      return { success: false, gone: true };
    }
    console.error("[push-server] Send failed:", err.statusCode || err.message);
    return { success: false, gone: false };
  }
}
