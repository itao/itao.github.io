'use strict';
const CACHE = 'physio1-v1';
const PAGE = '/physio1.html';
const ASSETS = [PAGE, '/physio1.webmanifest', '/physio1-assets/icon-192.png', '/physio1-assets/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('physio1-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !ASSETS.includes(url.pathname)) return;
  if (url.pathname === PAGE) {
    // Prefer the current published routine, falling back to the last offline copy.
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(PAGE, response.clone());
        return response;
      }
      return (await caches.match(PAGE)) || response;
    }).catch(() => caches.match(PAGE)));
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
