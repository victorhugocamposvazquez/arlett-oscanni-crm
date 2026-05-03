/**
 * Service worker para PWA instalable.
 * - Chrome exige un handler «fetch» para considerar la app instalable.
 * - Peticiones a red sin caché de documentos (no interfiere con Next.js).
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  event.respondWith(fetch(request));
});
