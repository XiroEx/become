// GET /api/auth/google — begin the Google sign-in flow.
// redAuth builds the authorization URL (with PKCE + state persisted server-side)
// and we redirect the browser to Google. The user comes back to
// /auth/callback/google (the redirect URI registered in the Google console).

import { NextRequest, NextResponse } from 'next/server'
import { getRedAuth } from '@/lib/redauth'

export async function GET(req: NextRequest) {
  try {
    const redauth = getRedAuth()
    const redirectAfter = req.nextUrl.searchParams.get('redirect') || '/dashboard'
    const { url } = await redauth.getProviderAuthUrl('google', redirectAfter)
    return NextResponse.redirect(url)
  } catch (err) {
    console.error('GET /api/auth/google error:', err)
    return NextResponse.redirect(new URL('/login?error=google', req.url))
  }
}
