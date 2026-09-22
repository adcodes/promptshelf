/*
  Promptshelf service worker. Caches only the app's own files so it opens offline.
  Network first: a fresh copy is used whenever there is a connection, so updates show up
  without bumping a version. Requests to GitHub are never touched.
*/
const CACHE = 'promptshelf-app';
const FILES = [
  './', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'fonts/familjen-grotesk-latin-400-normal.woff2', 'fonts/familjen-grotesk-latin-600-normal.woff2',
  'fonts/familjen-grotesk-latin-700-normal.woff2', 'fonts/jetbrains-mono-latin-400-normal.woff2',
  'fonts/jetbrains-mono-latin-500-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
