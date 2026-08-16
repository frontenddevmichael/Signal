/* §12 web push service worker. */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Signal", body: "" };
  try {
    data = event.data ? JSON.parse(event.data.text()) : data;
  } catch {
    /* fall back to defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Signal", {
      body: data.body || "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "signal-push",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
