/* PawTrail service worker — offline-first shell caching */
const CACHE = "pawtrail-v7";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./data.js", "./features.js", "./supabase-client.js"];

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
  // Keep the app shell fresh during development, with cache fallback for offline use.
  const url = new URL(e.request.url);
  if (url.origin === location.origin && SHELL.some(s => url.pathname.endsWith(s.replace("./", "")))) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, copy));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
});
