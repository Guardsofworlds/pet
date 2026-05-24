/* PawTrail service worker — offline-first shell caching */
const CACHE = "pawtrail-v3";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./data.js", "./features.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  // Network-first for API/image calls, cache-first for app shell
  const url = new URL(e.request.url);
  if (url.origin === location.origin && SHELL.some(s => url.pathname.endsWith(s.replace("./", "")))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  } else {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
