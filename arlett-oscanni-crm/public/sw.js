// Service worker mínimo para habilitar instalación PWA (Chrome/Edge Windows, Android)
const CACHE_NAME = "crm-rehabinco-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});
