/* Simple service worker to enable installability + basic offline support. */

const CACHE_NAME = "brynn-outfits-static-v1";

// Only include files that are guaranteed to exist.
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/assets/styles.css",
  "/assets/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fallback to cached app shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", res.clone());
          return res;
        } catch (_) {
          return (await caches.match("/")) || Response.error();
        }
      })()
    );
    return;
  }

  // Static/runtime cache for same-origin resources (assets, data, images).
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (!res || res.status !== 200) return res;

        // Avoid caching huge/unbounded cross-origin resources; same-origin only here.
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
        return res;
      } catch (_) {
        return Response.error();
      }
    })()
  );
});

