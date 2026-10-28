/* Orbit service worker: receives Web Push reminders. No offline caching of private data. */
self.addEventListener("push", (event) => {
  let data = { title: "Orbit", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* ignore malformed payloads */
  }
  event.waitUntil(
    self.registration.showNotification(String(data.title).slice(0, 120), {
      body: String(data.body ?? "").slice(0, 300),
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
      tag: "orbit-reminder",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ("focus" in w) return w.navigate(url).then((c) => c?.focus());
      return self.clients.openWindow(url);
    }),
  );
});
