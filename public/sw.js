/* Stack offline shell. Keep this tiny. */
const CACHE = "stack-offline-v3";
const PRECACHE = [
  "/",
  "/favicon.svg",
  "/og.jpg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/__grok/icon-180.png",
  "/__grok/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  );
  if (!self.registration.active) self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("stack-offline-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data && data.type === "PRECACHE" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(CACHE).then((cache) =>
        Promise.all(
          data.urls.map((url) => cache.add(url).catch(() => undefined)),
        ),
      ),
    );
  }
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function skipPath(url) {
  const p = url.pathname;
  return (
    p.startsWith("/api/") ||
    p.startsWith("/auth") ||
    p.startsWith("/__auth") ||
    p.includes("better-auth")
  );
}

function isAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/__grok/") ||
    /\.(?:js|mjs|css|woff2?|png|jpe?g|svg|webp|webmanifest)$/i.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const hit = (await caches.match(request)) || (await caches.match("/"));
    if (hit) return hit;
    return new Response("<!doctype html><title>Stack</title>", {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!sameOrigin(url) || skipPath(url)) return;
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
