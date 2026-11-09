const CACHE_NAME = "stockinho-shell-v1";
const STATIC_ASSET_PREFIX = "/_next/static/";
const ICON_PATHS = new Set(["/favicon.svg", "/icon-192.svg", "/icon-512.svg"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => fetch("/").then((response) => {
        if (response.ok) {
          return cache.put("/", response);
        }
        return undefined;
      }))
      .catch((error) => {
        console.error("Não foi possível preparar o cache offline do Stockinho.", error);
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET"
    || url.origin !== self.location.origin
    || url.pathname.startsWith("/api/")
    || url.pathname === "/sw.js"
  ) {
    return;
  }

  const isStaticAsset = url.pathname.startsWith(STATIC_ASSET_PREFIX) || ICON_PATHS.has(url.pathname);
  if (!isStaticAsset && request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (response.ok && (isStaticAsset || url.pathname === "/")) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }
        return response;
      });
    }),
  );
});
