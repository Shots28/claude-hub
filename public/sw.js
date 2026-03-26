// ---------------------------------------------------------------------------
// Claude Hub — Service Worker
// Handles push notifications and notification click navigation
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  // Activate new SW immediately on deploy — don't wait for tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of all open tabs immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Malformed payload — ignore
    return;
  }

  const { title, body, instanceId, tag } = payload;

  const options = {
    body: body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: tag || undefined, // Same tag replaces previous notification (dedup)
    data: { instanceId: instanceId || null },
    renotify: !!tag, // Vibrate even if replacing a notification with same tag
  };

  event.waitUntil(self.registration.showNotification(title || "Claude Hub", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const instanceId = event.notification.data?.instanceId;
  const targetUrl = instanceId ? `/instances/${instanceId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing Claude Hub tab
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          // Post message so the client-side listener can navigate
          client.postMessage({ type: "navigate", url: targetUrl });
          return;
        }
      }
      // No existing tab — open a new one
      return self.clients.openWindow(targetUrl);
    })
  );
});
