// Service Worker: macht die Seite nach dem ersten Laden offline nutzbar.
// Seite selbst: erst Netz (damit Updates sofort ankommen), sonst Cache.
// qr.js, Icons: erst Cache, sonst Netz. Alles kommt vom eigenen Server.
// Bei Änderungen an der Liste unten oder an gecachten Dateien CACHE hochzählen.
const CACHE = 'dph-v3';
const CORE = [
  './',
  './index.html',
  './qr.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
