import { NextRequest, NextResponse } from 'next/server'
import {
  NATIVE_BROWSER_COOKIE,
  NATIVE_BROWSER_COOKIE_MAX_AGE_SECONDS,
  NATIVE_BROWSER_QUERY_PARAM,
} from '@/lib/nativeBrowserMarker'

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  let response: NextResponse
  if (pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('auth_token')?.value

    if (!token) {
      response = NextResponse.redirect(new URL('/login', request.url))
    } else {
      // JWT verification belongs to the server-only route boundary. Middleware
      // deliberately does not load secrets or the Mongo-backed secret store
      // (which is not edge-compatible); AuthGuard and every protected API
      // route still perform authoritative verification before returning user
      // data.
      response = NextResponse.next()
    }
  } else {
    response = NextResponse.next()
  }

  // NP-205: turn `?app=1` (set by the native app on every URL it opens, see
  // lib/nativeBrowserMarker.ts) into a cookie, so a page reached after a
  // redirect — the sign-in hand-off chain included — still knows it is inside
  // the native app's browser and never shows the "Get the app" prompt.
  if (searchParams.get(NATIVE_BROWSER_QUERY_PARAM) === '1') {
    response.cookies.set(NATIVE_BROWSER_COOKIE, '1', {
      maxAge: NATIVE_BROWSER_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
    })
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/handoff'],
}
