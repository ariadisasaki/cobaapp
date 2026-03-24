const CACHE_NAME = "hilal-v3";

self.addEventListener("install", e=>{
  self.skipWaiting();
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys().then(keys=>{
      return Promise.all(keys.map(k=>caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", e=>{
  e.respondWith(fetch(e.request));
});
