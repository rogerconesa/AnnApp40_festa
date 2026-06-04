const CACHE = 'annapp-festa-v2';
const ASSETS = ['/index.html', '/main.css', '/app.js', '/auth.js',
                '/config.js', '/drive.js', '/sheets.js', '/manifest.json',
                '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // APIs externes: sempre xarxa
  if (!url.pathname.match(/\.(html|css|js|json|png|jpg|jpeg|svg|ico)$/)) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Fitxers locals: network-first (evita servir codi antic en cache)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
