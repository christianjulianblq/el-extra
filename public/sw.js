const CACHE_NAME = 'el-extra-v3';
const OFFLINE_URL = '/offline.html';

// Only cache the app shell and offline fallback
const PRECACHE_FILES = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: precache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_FILES).catch(() => {})
    )
  );
  self.skipWaiting();
});

// Activate: clean ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: only handle navigation requests.
// Let _next/static, APIs, images, etc. go through normally —
// Vercel already sets correct cache headers for those.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful navigation responses as app shell
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Offline: try serving the cached version of this exact URL
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Try serving any cached navigation page (app shell)
        // so React can boot and use localStorage data
        const allCached = await caches.open(CACHE_NAME);
        const keys = await allCached.keys();
        for (const key of keys) {
          const resp = await allCached.match(key);
          if (resp && resp.headers.get('content-type')?.includes('text/html')) {
            return resp;
          }
        }

        // Last resort: static offline page
        const offlinePage = await caches.match(OFFLINE_URL);
        if (offlinePage) return offlinePage;

        return new Response('Offline', { status: 503 });
      })
  );
});
