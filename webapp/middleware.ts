import { NextRequest, NextResponse } from 'next/server'
import { NATIVE_BROWSER_COOKIE, nativeBrowserCookie } from '@/lib/nativeBrowserMarker'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // JWT verification belongs to the server-only route boundary. Middleware
  // deliberately does not load secrets or the Mongo-backed secret store (which
  // is not edge-compatible); AuthGuard and every protected API route still
  // perform authoritative verification before returning user data.
  const response = NextResponse.next()

  // NP-205: keep the "this tab is the native app's in-app browser" marker
  // alive for as long as a Tier-3 session keeps browsing /dashboard pages,
  // not just its first one. Middleware never ORIGINATES the marker — only
  // GET /auth/handoff does, the one path exclusively reached by the native
  // app — it only refreshes a cookie it finds already set, so it cannot be
  // forged by a magic query string hit from ordinary mobile Safari.
  if (request.cookies.get(NATIVE_BROWSER_COOKIE)?.value === '1') {
    response.headers.append('Set-Cookie', nativeBrowserCookie())
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
