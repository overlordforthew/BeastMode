// Beast Mode Service Worker
// Cache version — bump this to force a cache refresh on deploy
const CACHE_VERSION = 'beastmode-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // CDN dependencies
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.5/babel.min.js',
];

// Offline fallback page (inline HTML returned when both network and cache miss)
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Beast Mode - Offline</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a0f; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; text-align: center; padding: 2rem;
  }
  h1 { font-size: 2rem; margin-bottom: 1rem; }
  p { color: #aaa; font-size: 1.1rem; line-height: 1.6; }
  .icon { font-size: 4rem; margin-bottom: 1.5rem; }
  button {
    margin-top: 2rem; padding: 0.8rem 2rem;
    background: #FF4D00; color: #fff; border: none;
    border-radius: 12px; font-size: 1rem; cursor: pointer;
    font-weight: 600;
  }
  button:active { transform: scale(0.97); }
</style>
</head>
<body>
<div>
  <div class="icon">&#x1F4F5;</div>
  <h1>You're Offline</h1>
  <p>Beast Mode needs an internet connection to load.<br>Check your connection and try again.</p>
  <button onclick="window.location.reload()">RETRY</button>
</div>
</body>
</html>`;

// ── Install: pre-cache static assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: route requests to the right strategy ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') return;

  // API calls: network-first, fall back to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Navigation requests (HTML pages): network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a copy of the latest HTML
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || new Response(OFFLINE_HTML, {
              headers: { 'Content-Type': 'text/html' },
            })
          )
        )
    );
    return;
  }

  // All other static assets: cache-first
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

// ── Strategy: cache-first ──
// Try cache, fall back to network (and cache the response for next time)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // If both cache and network fail, return a basic error
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ── Strategy: network-first ──
// Try network, fall back to cache if offline
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Offline', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
