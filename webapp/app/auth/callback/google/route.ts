// GET /auth/callback/google — Google redirects here with ?code & ?state.
// redAuth exchanges the code, verifies it, and returns the provider profile.
// We bridge that verified email into a Become session (cookie + JWT), then hand
// the JWT to the client via the URL fragment (never sent to the server / logs)
// so the SPA can stash it in localStorage the same way magic-link login does.
//
// All redirects are built from the PUBLIC origin (publicOrigin), NOT req.url:
// behind Traefik req.url is the container's internal 0.0.0.0:PORT, which the
// browser refuses to load ("restricted network port").

import { NextRequest, NextResponse } from 'next/server'
import { getRedAuth } from '@/lib/redauth'
import { bridgeToBecomeSession, authCookie, publicOrigin } from '@/lib/authBridge'

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req)
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=google', origin))
  }

  try {
    const redauth = await getRedAuth()
    const result = await redauth.handleProviderCallback('google', code, state)
    const email = result.profile?.email || result.user?.email
    const name = result.profile?.name || result.user?.name

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=google_email', origin))
    }

    const { token } = await bridgeToBecomeSession({
      authId: String(result.user._id),
      email,
      name: name ?? undefined,
      avatarUrl: result.profile?.picture ?? undefined,
    })

    // Token goes in the fragment so it never reaches the server / access logs.
    const finishUrl = new URL('/auth/finish', origin)
    finishUrl.hash = encodeURIComponent(token)

    const res = NextResponse.redirect(finishUrl)
    res.headers.append('Set-Cookie', authCookie(token))
    return res
  } catch (err) {
    console.error('GET /auth/callback/google error:', err)
    return NextResponse.redirect(new URL('/login?error=google', origin))
  }
}
