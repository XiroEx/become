// GET /auth/callback/google — Google redirects here with ?code & ?state.
// redAuth exchanges the code, verifies it, and returns the provider profile.
// We bridge that verified email into a Become session (cookie + JWT), then hand
// the JWT to the client via the URL fragment (never sent to the server / logs)
// so the SPA can stash it in localStorage the same way magic-link login does.
//
// ─── TWO ENDINGS (NP-126) ────────────────────────────────────────────────────
//
// A BROWSER gets the fragment, as it always has: /auth/finish#<jwt>.
//
// THE APP GETS A CODE AND NEVER THE TOKEN. When the flow was started with
// `app=1` (lib/appAuthCode.ts — the app-flow cookie is how we know), this
// redirects to /auth/app-callback?code=…: single use, sixty seconds, bound to
// the member AND to the challenge the app raised. The app exchanges it at
// POST /api/auth/exchange with the verifier only it holds. The JWT minted here
// is deliberately DISCARDED in that case, and no session cookie is set — the
// exchange mints the session from the User row when it is spent, exactly as
// the hand-off redemption does, so nothing signed in here is left lying in a
// browser the app is about to close.
//
// All redirects are built from the PUBLIC origin (publicOrigin), NOT req.url:
// behind Traefik req.url is the container's internal 0.0.0.0:PORT, which the
// browser refuses to load ("restricted network port").

import { NextRequest, NextResponse } from 'next/server'
import { getRedAuth } from '@/lib/redauth'
import { bridgeToBecomeSession, authCookie, publicOrigin } from '@/lib/authBridge'
import {
  APP_AUTH_FLOW_COOKIE,
  appAuthCallbackUrl,
  clearedAppAuthFlowCookie,
  isAppAuthChallenge,
} from '@/lib/appAuthCode'
import { createAppAuthCode } from '@/models/AppAuthCode'

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req)
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  // Read before anything can fail: an app flow must be told it failed in the
  // language the app understands (a redirect it is waiting for), not left on a
  // web sign-in page inside a browser sheet.
  const challenge = req.cookies.get(APP_AUTH_FLOW_COOKIE)?.value
  const appFlow = isAppAuthChallenge(challenge)

  /** Refuse in whichever direction this flow came from. */
  const refuse = (reason: string) => {
    const res = NextResponse.redirect(
      appFlow
        ? appAuthCallbackUrl(origin, { error: reason })
        : new URL(`/login?error=${reason}`, origin),
    )
    res.headers.append('Set-Cookie', clearedAppAuthFlowCookie())
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  if (!code || !state) return refuse('google')

  try {
    const redauth = await getRedAuth()
    const result = await redauth.handleProviderCallback('google', code, state)
    const email = result.profile?.email || result.user?.email
    const name = result.profile?.name || result.user?.name

    if (!email) return refuse('google_email')

    const { token, user } = await bridgeToBecomeSession({
      authId: String(result.user._id),
      email,
      name: name ?? undefined,
      avatarUrl: result.profile?.picture ?? undefined,
    })

    if (appFlow) {
      // The app's half. Nothing but a code crosses the boundary.
      const minted = await createAppAuthCode({
        userId: user.id,
        // Narrowed by `appFlow`, which is `isAppAuthChallenge(challenge)`.
        challenge,
        provider: 'google',
      })
      const res = NextResponse.redirect(appAuthCallbackUrl(origin, { code: minted.code }))
      res.headers.append('Set-Cookie', clearedAppAuthFlowCookie())
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    // Token goes in the fragment so it never reaches the server / access logs.
    const finishUrl = new URL('/auth/finish', origin)
    finishUrl.hash = encodeURIComponent(token)

    const res = NextResponse.redirect(finishUrl)
    res.headers.append('Set-Cookie', authCookie(token))
    res.headers.append('Set-Cookie', clearedAppAuthFlowCookie())
    return res
  } catch (err) {
    console.error('GET /auth/callback/google error:', err)
    return refuse('google')
  }
}
