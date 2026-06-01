// Service-worker routing decision — PURE, side-effect-free.
//
// This module exists so the service worker's "which caching strategy does this
// request get?" decision can be unit-tested in node (sw.js is browser-only
// plain JS and can't be imported by the tsx test runner). `public/sw.js`
// MIRRORS this exact decision table inline — if you change one, change the
// other (the unit tests pin the contract).
//
// WHY HTML IS NEVER CACHE-FIRST: Next.js ships content-hashed chunks under
// /_next/static/. Every build produces new hashes. If the SW served cached
// HTML, that HTML would reference chunk URLs that no longer exist on the new
// container → "this page couldn't load" / 404 until the cache evicts. So HTML
// and navigations are always network-first (fresh HTML → fresh chunk refs),
// with cache used ONLY as an offline fallback.

export type Strategy = 'network-first' | 'cache-first' | 'passthrough'

export interface RequestInfo {
  /** Absolute request URL. */
  url: string
  /** HTTP method, e.g. 'GET', 'POST'. */
  method: string
  /**
   * The Request.mode for fetch events. 'navigate' means a top-level
   * document/navigation request (HTML).
   */
  mode?: string
  /** Optional Accept header — a secondary signal for HTML requests. */
  accept?: string
  /** The origin the SW is running on (request must match to be handled). */
  selfOrigin: string
}

/** True for hashed, content-addressed, immutable build output. */
function isImmutableStatic(pathname: string): boolean {
  return pathname.startsWith('/_next/static/')
}

/** True for the small set of stable static assets safe to cache-first. */
function isStaticAsset(pathname: string): boolean {
  if (pathname === '/manifest.json') return true
  if (pathname === '/logo.png' || pathname === '/profile.png') return true
  if (pathname === '/favicon.ico') return true
  if (pathname.startsWith('/icons/')) return true
  if (pathname.startsWith('/fonts/')) return true
  // Next.js optimized images are content-addressed via query hash.
  if (pathname.startsWith('/_next/image')) return true
  return false
}

/** True when the request is a top-level navigation / HTML document fetch. */
function isNavigation(info: RequestInfo): boolean {
  if (info.mode === 'navigate') return true
  if (info.accept && info.accept.includes('text/html')) return true
  return false
}

/**
 * Decide the caching strategy for a single request. Pure: same inputs always
 * yield the same output, no I/O.
 *
 * Rules (see file header for the reasoning):
 *  - Non-GET            → passthrough (NEVER cached or intercepted for caching)
 *  - Cross-origin       → passthrough (don't touch other origins)
 *  - Navigation / HTML  → network-first (fresh chunk refs; cache = offline only)
 *  - /_next/static/**   → cache-first (immutable, content-hashed → safe forever)
 *  - static assets      → cache-first (icons, manifest, logo, fonts, images)
 *  - GET /api/**        → network-first (fresh data; cache = best-effort offline)
 *  - everything else    → passthrough
 */
export function chooseStrategy(info: RequestInfo): Strategy {
  // Only ever consider GET. Any non-GET (POST/PATCH/PUT/DELETE/HEAD/...) goes
  // straight to the network untouched — we never cache mutations.
  if (info.method.toUpperCase() !== 'GET') return 'passthrough'

  let parsed: URL
  try {
    parsed = new URL(info.url)
  } catch {
    return 'passthrough'
  }

  // Never touch cross-origin requests (CDNs, Instagram/YouTube, analytics...).
  if (parsed.origin !== info.selfOrigin) return 'passthrough'

  const pathname = parsed.pathname

  // Navigations / HTML are network-first regardless of path (chunk-hash trap).
  if (isNavigation(info)) return 'network-first'

  // Immutable hashed build output — cache forever, new build = new URL.
  if (isImmutableStatic(pathname)) return 'cache-first'

  // Stable static assets.
  if (isStaticAsset(pathname)) return 'cache-first'

  // GET API requests — network-first, cache only as an offline fallback.
  if (pathname.startsWith('/api/')) return 'network-first'

  // Anything else we don't explicitly handle: let it pass through to network.
  return 'passthrough'
}
