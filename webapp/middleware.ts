import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    await jwtVerify(token, secret)
    return NextResponse.next()
  } catch {
    // Expired or invalid token — clear cookie and redirect
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.set('auth_token', '', { maxAge: 0 })
    return response
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
