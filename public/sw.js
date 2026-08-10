/*
 * Service worker for reminders.
 *
 * Kept deliberately minimal: it exists to receive pushes and focus the app when
 * one is tapped. It does not cache anything — an offline shell would risk
 * serving a stale weigh-in page, and stale numbers are worse than none.
 */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Helia";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Time to log.",
      icon: "/icon-192.png",
      // A badge is an alpha mask — Android keeps the shape and discards the
      // colour. This used to point at the full-colour icon, which arrived in
      // the status bar as a grey blob.
      badge: "/icon-badge-96.png",
      tag: payload.tag || "helia",
      // Without this, a second push on the same tag replaces the first in
      // silence. A reminder that updates with no buzz reads as one that never
      // came.
      renotify: Boolean(payload.tag),
      // When the event happened, not when the device happened to receive it —
      // a push delivered late otherwise timestamps itself late.
      timestamp: payload.at || Date.now(),
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse an open tab rather than piling up new ones.
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
