self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const same = windows.find((w) => w.url === url) ?? windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (same) return same.focus().then((w) => (w && w.url !== url ? w.navigate(url) : w));
      return self.clients.openWindow(url);
    }),
  );
});
