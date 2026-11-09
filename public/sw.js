// Hand-written service worker (no build step). Bump VERSION when this file changes;
// activation then drops every cache from the previous version.
const VERSION = "v1";
const STATIC = `static-${VERSION}`; // hashed assets, fonts, icons, uploaded files: immutable
const DATA = `data-${VERSION}`; // HTML pages + GET server-function responses
// "/offline", not "/offline.html": Workers static assets 307-redirect *.html to the bare path
const OFFLINE = "/offline";
const PRECACHE = [OFFLINE, "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(`-${VERSION}`)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// never cache errors, 401s or the redirect to /login
const cacheable = (res) => res.ok && !res.redirected && res.type === "basic";

// ponytail: no network timeout; on flaky "lie-fi" a request waits for the browser's own timeout
async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(req);
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    const fallback = fallbackUrl && (await caches.match(fallbackUrl));
    // a cached response that was redirected can't answer a navigation; re-wrap it
    return fallback
      ? new Response(fallback.body, { status: 200, headers: fallback.headers })
      : Response.error();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // writes go straight to the network; the app's outbox handles them when offline
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  if (req.mode === "navigate") return e.respondWith(networkFirst(req, OFFLINE));
  if (url.pathname.startsWith("/_serverFn/")) return e.respondWith(networkFirst(req));
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/files/") ||
    /\.(woff2?|png|svg|webmanifest)$/.test(url.pathname)
  ) {
    return e.respondWith(cacheFirst(req));
  }
});

// sent by the app on logout: drop cached pages and data from this device
self.addEventListener("message", (e) => {
  if (e.data === "logout") e.waitUntil(caches.delete(DATA));
});
