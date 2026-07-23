import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // JWT verification belongs to the server-only route boundary. Middleware
  // deliberately does not load secrets or the Mongo-backed secret store (which
  // is not edge-compatible); AuthGuard and every protected API route still
  // perform authoritative verification before returning user data.
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
