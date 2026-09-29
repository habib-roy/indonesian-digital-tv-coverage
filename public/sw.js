/*
  Service worker: makes the app installable and lets the UI shell open offline.
  - Page (navigation): network first, cached copy when offline, so new deploys show up immediately.
  - Same-origin /assets/*: cache first. Vite puts a content hash in every filename, so they never change.
  - Everything else (map tiles, DEM, WorldCover, Nominatim): not touched, goes straight to the network.
  ponytail: no offline map/terrain; add tile caching here when the "mode offline" issue is picked up.
  Bump VERSION to drop old caches after changing this file's strategy.
*/
const VERSION = "v1";
const CACHE = `tv-digital-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "manifest.webmanifest", "icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./")),
    );
    return;
  }

  if (url.pathname.includes("/assets/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
