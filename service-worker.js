const PREFIX = `rauchfrei-public:${self.registration.scope}:`;
const CACHE = `${PREFIX}0.1.1`;
const FILES = ['./', './index.html', './style.css', './src/core.js', './src/app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const URLS = FILES.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS)));
  // Updates wait until old tabs close. Do not force-switch a running app.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url); url.search = ''; url.hash = '';
  if (!URLS.includes(url.href)) return;
  // Serve one precached release consistently. A new worker installs the next one.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic' && !response.redirected) await cache.put(url.href, response.clone());
    return response;
  })());
});
