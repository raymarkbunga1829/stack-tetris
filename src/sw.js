/* Stack offline shell. Keep this tiny.
 * Template only: scripts/sw-build-plugin.mjs emits /sw.js on every build with
 * VERSION and ASSETS filled in, so each deploy installs a new worker and cache.
 * Never bump a version here by hand. */
const VERSION = "dev";
const ASSETS = [];

const CACHE = `stack-offline-${VERSION}`;
// Required: if any of these fail the install fails and the current worker keeps
// serving, so a half-cached build can never take over offline play.
const SHELL = ["/", ...ASSETS];
const EXTRAS = [
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
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(SHELL.map((url) => new Request(url, { cache: "no-cache" })));
      await Promise.all(EXTRAS.map((url) => cache.add(url).catch(() => undefined)));
    }),
  );
  // First install takes over at once; later builds wait for the page's prompt.
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
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function skipPath(url) {
  const p = url.pathname;
  return (
    p === "/sw.js" ||
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
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    // Prefer this build's own document so offline HTML matches cached assets.
    const hit =
      (await cache.match(request)) || (await cache.match("/")) || (await caches.match(request));
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
