// iZone POS Service Worker - Phase 4 Offline-First Engine
const CACHE_NAME = 'izone-pos-v2-phase4'
const PRECACHE_ASSETS = [
  '/',
  '/pos',
  '/sync',
  '/inventory',
  '/manifest.webmanifest',
  '/favicon.ico',
]

// ── Install: Cache App Shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache partial warning:', err)
      })
    })
  )
  self.skipWaiting()
})

// ── Activate: Clean up old caches without touching IndexedDB ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Purging outdated cache:', key)
            return caches.delete(key)
          })
      )
    })
  )
  self.clients.claim()
})

// ── Fetch: Cache Strategy with Secure API Exclusion ───────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 1. NEVER intercept authentication routes or cloud sync mutations
  if (
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/api/sync') ||
    event.request.method !== 'GET'
  ) {
    return
  }

  // 2. Navigation requests: Network-first, fallback to cached page or /pos
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(event.request)
          if (cached) return cached
          const posFallback = await caches.match('/pos')
          if (posFallback) return posFallback
          const rootFallback = await caches.match('/')
          return rootFallback || new Response('Offline - iZone POS', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        })
    )
    return
  }

  // 3. Static assets & scripts: Stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
          return networkResponse
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})
