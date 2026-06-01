/*
 * Become PWA service worker.
 *
 * Two responsibilities:
 *   1. Push notifications (push + notificationclick) — UNCHANGED from before.
 *   2. Conservative runtime caching for instant / offline app-shell loads.
 *
 * ------------------------------------------------------------------------
 * CACHING STRATEGY (and WHY it is the way it is)
 * ------------------------------------------------------------------------
 * Next.js ships content-hashed chunks under /_next/static/. Every build mints
 * NEW hashes. The HTML that references them is therefore disposable: HTML from
 * build A points at chunk URLs that DO NOT EXIST on build B's container.
 *
 * This app already had outages ("this page couldn't load" / 404) caused by
 * stale HTML being cached (by a CDN) and pointing at dead chunks — which is
 * why next.config.ts forces `Cache-Control: no-store` on HTML. A naive
 * cache-first service worker would reintroduce that bug far worse: a SW could
 * brick the app for every returning visitor until the cache evicted.
 *
 * So the rules are deliberately conservative:
 *
 *   - Navigations / HTML  -> NETWORK-FIRST. Always prefer fresh HTML (fresh
 *                            chunk references). The cache is consulted ONLY
 *                            when the network fails (offline), and we never
 *                            precache specific page HTML.
 *   - /_next/static/**    -> CACHE-FIRST (stale-while-revalidate). These URLs
 *                            are content-addressed, so caching them forever is
 *                            safe — a new build is a new URL, never a stale hit.
 *   - /api/**             -> PASSTHROUGH. We never cache authed per-user API
 *                            data in the SW (cache is keyed by URL, so an
 *                            offline hit could serve one user's data to another
 *                            on a shared browser). Dashboard offline + instant
 *                            repaint is handled by the in-app localStorage SWR
 *                            layer, which is cleared on logout.
 *   - Static assets       -> CACHE-FIRST (icons, manifest, logo, fonts, images).
 *   - Non-GET requests    -> PASSTHROUGH (never cached, never intercepted).
 *   - Cross-origin        -> PASSTHROUGH (we don't touch other origins).
 *   - Anything else       -> PASSTHROUGH to the network.
 *
 * Kill-switch: cache names are versioned (CACHE_VERSION). On activate we delete
 * every cache that isn't the current version, and skipWaiting + clients.claim
 * let a corrected SW supersede a bad one without waiting for all tabs to close.
 *
 * NOTE: the routing decision below MUST mirror lib/swStrategy.ts
 * (chooseStrategy). That module is unit-tested; this file can't be imported by
 * the test runner, so the two are kept in sync by hand.
 */

const CACHE_VERSION = 'become-v1'
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
// Single offline-fallback HTML shell (the last good navigation response).
const OFFLINE_SHELL_KEY = '__offline_shell__'

/* ----------------------------- push (unchanged) ---------------------------- */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'BECOME', body: event.data.text(), url: '/dashboard' }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-96x96.png',
    tag: payload.tag || 'become-notification',
    renotify: !!payload.tag,
    data: { url: payload.url || '/dashboard' },
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

/* --------------------------- lifecycle / kill-switch ------------------------ */

// Take over promptly so a corrected SW can supersede a broken one.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Kill-switch: delete every cache that isn't the current version.
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((name) => name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      )
      await self.clients.claim()
    })()
  )
})

/* ----------------------------- routing decision ----------------------------- */
// Mirror of lib/swStrategy.ts#chooseStrategy. Keep in sync.

function isImmutableStatic(pathname) {
  return pathname.startsWith('/_next/static/')
}

function isStaticAsset(pathname) {
  if (pathname === '/manifest.json') return true
  if (pathname === '/logo.png' || pathname === '/profile.png') return true
  if (pathname === '/favicon.ico') return true
  if (pathname.startsWith('/icons/')) return true
  if (pathname.startsWith('/fonts/')) return true
  if (pathname.startsWith('/_next/image')) return true
  return false
}

function isNavigation(request) {
  if (request.mode === 'navigate') return true
  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html')
}

function chooseStrategy(request) {
  // Never cache or intercept-for-caching any non-GET request.
  if (request.method.toUpperCase() !== 'GET') return 'passthrough'

  let parsed
  try {
    parsed = new URL(request.url)
  } catch {
    return 'passthrough'
  }

  // Never touch cross-origin requests.
  if (parsed.origin !== self.location.origin) return 'passthrough'

  const pathname = parsed.pathname

  // Navigations / HTML are network-first regardless of path (chunk-hash trap).
  if (isNavigation(request)) return 'network-first'

  if (isImmutableStatic(pathname)) return 'cache-first'
  if (isStaticAsset(pathname)) return 'cache-first'

  // API: passthrough — never cache authed per-user data in the SW (URL-keyed
  // cache could leak across users offline). localStorage SWR handles offline.
  if (pathname.startsWith('/api/')) return 'passthrough'

  return 'passthrough'
}

/* ------------------------------- strategies -------------------------------- */

// Cache-first with background revalidation. Safe for immutable + stable assets.
async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)

  const fetchAndUpdate = fetch(request)
    .then((response) => {
      // Only cache successful, basic/cors responses (not opaque error pages).
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {})
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    // Stale-while-revalidate: serve cache now, refresh in background.
    fetchAndUpdate.catch(() => {})
    return cached
  }

  const fresh = await fetchAndUpdate
  if (fresh) return fresh
  // Last resort: a real network fetch (lets the browser surface the error).
  return fetch(request)
}

// Network-first for HTML navigations. Cache is offline fallback ONLY.
async function navigationNetworkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  try {
    const response = await fetch(request)
    // Stash the last good navigation HTML as the generic offline shell.
    if (response && response.ok) {
      cache.put(OFFLINE_SHELL_KEY, response.clone()).catch(() => {})
    }
    return response
  } catch (err) {
    // Offline: try the exact page, then the generic shell.
    const cachedPage = await cache.match(request)
    if (cachedPage) return cachedPage
    const shell = await cache.match(OFFLINE_SHELL_KEY)
    if (shell) return shell
    throw err
  }
}

/* --------------------------------- fetch ----------------------------------- */

self.addEventListener('fetch', (event) => {
  const { request } = event

  let strategy
  try {
    strategy = chooseStrategy(request)
  } catch {
    // Be defensive: a routing error must never block the request.
    strategy = 'passthrough'
  }

  if (strategy === 'passthrough') {
    // Don't call respondWith — let the request go to the network normally.
    return
  }

  // After passthrough is excluded, only two strategies remain: cache-first
  // (static assets) and network-first (navigations only — /api is passthrough).
  const handler = strategy === 'cache-first' ? cacheFirst : navigationNetworkFirst

  event.respondWith(
    // Final safety net: if the strategy ever throws, fall back to plain fetch.
    handler(request).catch(() => fetch(request))
  )
})
