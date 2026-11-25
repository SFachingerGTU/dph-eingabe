// Service Worker: offline-first.
// - Alle Dateien der App liegen im Cache; Start und Navigation warten nie auf das Netz.
// - Jede Anfrage wird sofort aus dem Cache beantwortet und im Hintergrund aus dem Netz
//   aufgefrischt (stale-while-revalidate).
// - Eine neue Version (neuer CACHE-Name) wartet, bis der Nutzer in der App „Neu laden“ tippt.
// Bei Änderungen an CORE oder größeren Änderungen an den Dateien CACHE hochzählen.
const CACHE = 'dph-v4';
const CORE = [
  './',
  './index.html',
  './qr.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
const INDEX = new URL('./index.html', self.location).href;

// Installation: alles oder nichts. Fehlt eine Datei, schlägt addAll fehl und die
// Installation wird verworfen; die bisherige Version bleibt aktiv.
// cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neue Version geladen wird.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .catch(err => caches.delete(CACHE).then(() => { throw err; })) // leeren Cache nicht liegen lassen
  );
});

// Erst auf Wunsch der Seite („Neu laden“) aktivieren – kein automatisches skipWaiting
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Aus dem Netz holen und bei Erfolg im Cache ablegen
function refresh(request, key) {
  return fetch(request).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      return caches.open(CACHE).then(c => c.put(key, copy)).then(() => res, () => res);
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const nav = req.mode === 'navigate';
  // Navigation: immer die App-Seite (index.html), egal mit welchen Parametern geöffnet
  const network = nav
    ? refresh(new Request(INDEX, { cache: 'no-cache' }), INDEX)
    : refresh(new Request(req, { cache: 'no-cache' }), req);
  const background = network.catch(() => {}); // offline: still scheitern
  e.waitUntil(background);

  const cached = caches.open(CACHE).then(c => nav
    ? c.match(req, { ignoreSearch: true }).then(hit => hit || c.match(INDEX))
    : c.match(req, { ignoreSearch: true }));
  // Treffer sofort ausliefern, sonst auf das Netz warten (nur bei nie gecachten Dateien)
  e.respondWith(cached.then(hit => hit || network));
});
