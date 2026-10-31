// Offline cache for the PWA. Cache-first for everything listed (all of it is
// static - the engine/data only changes when this file's CACHE_NAME is
// bumped on a new deploy), with a network fallback for anything not listed.
// Bump CACHE_NAME whenever a cached file's content changes, so installs
// pick up the new version instead of serving stale assets forever.
const CACHE_NAME = "vedic-wall-clock-v14";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/settings.js",
  "./js/data/panchanga-data.json",
  "./js/engine/ayanamsa.js",
  "./js/engine/elongation.js",
  "./js/engine/ghati.js",
  "./js/engine/karana.js",
  "./js/engine/lagna.js",
  "./js/engine/day-events.js",
  "./js/engine/masa.js",
  "./js/engine/nakshatra.js",
  "./js/engine/panchanga.js",
  "./js/engine/scaled-intervals.js",
  "./js/engine/sidereal.js",
  "./js/engine/sunrise.js",
  "./js/engine/tithi.js",
  "./js/engine/util.js",
  "./js/engine/yoga.js",
  "./js/render/dial.js",
  "./js/render/ring-adapter.js",
  "./js/vendor/astronomy.browser.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
    })
  );
});
