// GET /api/auth/google — begin the Google sign-in flow.
// redAuth builds the authorization URL (with PKCE + state persisted server-side)
// and we redirect the browser to Google. The user comes back to
// /auth/callback/google (the redirect URI registered in the Google console).
//
// ─── THE NATIVE FLOW (NP-126) ────────────────────────────────────────────────
//
// Google refuses sign-in inside an embedded web view, so the app opens THIS
// url in the system authentication session (`WebBrowser.openAuthSessionAsync`)
// with two extra parameters:
//
//   app=1        this round-trip ends in the app, not in a browser tab
//   challenge=…  SHA-256 (base64url) of a verifier the app keeps
//
// Both are remembered in one short-lived HttpOnly cookie, because the CALLBACK
// is where the decision has to be made — the token goes in the fragment for a
// browser, and a one-time code goes to /auth/app-callback for the app. The
// cookie carries a hash, not a secret, and lib/appAuthCode.ts explains why it
// is a cookie rather than redAuth's redirect state.
//
// A missing or malformed challenge with app=1 is REFUSED here rather than
// downgraded to the web flow: downgrading would end with a JWT in a fragment
// the app never reads, and a member staring at a browser that went nowhere.

import { NextRequest, NextResponse } from 'next/server'
import { getRedAuth } from '@/lib/redauth'
import { publicOrigin } from '@/lib/authBridge'
import {
  appAuthFlowCookie,
  clearedAppAuthFlowCookie,
  isAppAuthChallenge,
  isAppAuthRequested,
} from '@/lib/appAuthCode'

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req)
  try {
    const wantsApp = isAppAuthRequested(req.nextUrl.searchParams)
    const challenge = req.nextUrl.searchParams.get('challenge')
    if (wantsApp && !isAppAuthChallenge(challenge)) {
      return NextResponse.redirect(new URL('/login?error=google_app', origin))
    }

    const redauth = await getRedAuth()
    const redirectAfter = req.nextUrl.searchParams.get('redirect') || '/dashboard'
    const { url } = await redauth.getProviderAuthUrl('google', redirectAfter)

    const res = NextResponse.redirect(url)
    // Either arm the app flow or disarm it. A browser that once signed in for
    // the app must not still be in app mode the next time somebody uses it.
    res.headers.append(
      'Set-Cookie',
      wantsApp && isAppAuthChallenge(challenge)
        ? appAuthFlowCookie(challenge)
        : clearedAppAuthFlowCookie(),
    )
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err) {
    console.error('GET /api/auth/google error:', err)
    return NextResponse.redirect(new URL('/login?error=google', origin))
  }
}
