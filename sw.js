/* Njord Weather web app: lets the home-screen app open without a connection.
   Network first for the app's own files (so updates arrive on the next open),
   falling back to the last copy saved here. Weather data is not touched -
   the page keeps its own saved forecast. */
const CACHE = "njord-shell-v1";
const SHELL = ["./", "./index.html", "./phone.js", "./phone.css", "./manifest.webmanifest",
               "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if(e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if(r.ok){ const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })
    .then(m => m || caches.match("./index.html"))));
});
