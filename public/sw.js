const CACHE_NAME = "medication-app-v2";
const base = self.location.pathname.substring(0, self.location.pathname.lastIndexOf("/"));
const ASSETS = [
  base + "/",
  base + "/manifest.webmanifest",
  base + "/medication-icon.svg",
  base + "/noct_main.webp",
  base + "/lux_main.webp",
  base + "/saku_main.webp",
  base + "/morning.webp",
  base + "/lunch.webp",
  base + "/dinner.webp",
  base + "/bedtime.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    return existing ? existing.focus() : self.clients.openWindow(base + "/");
  }));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(base + "/"))));
});
