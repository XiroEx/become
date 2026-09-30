import { NextRequest, NextResponse } from 'next/server'
import { appAuthReturnUrl } from '@/lib/appAuthCode'

export const dynamic = 'force-dynamic'

// ─── GET /auth/app-callback?code= ────────────────────────────────────────────
//
// WHERE A NATIVE SIGN-IN COMES BACK. `/auth/callback/google` redirects here
// when the flow was started with `app=1`, carrying a one-time code and NEVER a
// token (lib/appAuthCode.ts says why that distinction is the whole feature).
//
// This handler exists to get that code the last few metres: into the app that
// opened the system authentication session. It answers a redirect to
// `become://auth/app-callback?code=…`, which is what CLOSES
// `ASWebAuthenticationSession` on iOS and the Custom Tab on Android and
// resolves `WebBrowser.openAuthSessionAsync` in the app that started the flow.
// An https URL cannot do that: the authentication session does not hand
// universal links to apps, it only recognises its own callback scheme.
//
// THE SCHEME IS SAFE FOR THIS AND WOULD NOT BE FOR A TOKEN. Another app on the
// device can claim `become://`. What it would catch is a code that is single
// use, dead in sixty seconds, and unspendable without the verifier that never
// left the app that generated it — which is exactly why the exchange has one.
//
// It is deliberately a SERVER redirect and not a page with a script: no JWT, no
// localStorage, nothing to render, and one fewer thing to go wrong inside a
// sheet the member is watching. `no-store`, because a cached redirect carrying
// a spent code is only ever confusing.
//
// (When NP-044 lands a real apple-app-site-association, this path can also be
// claimed as a universal link so a code that arrives OUTSIDE the authentication
// session — from Safari, say — reaches the app too. Nothing here changes for
// that: it is the same URL, and this redirect stays the route the flow uses.)
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  const location = code
    ? appAuthReturnUrl({ code })
    : appAuthReturnUrl({ error: error || 'google' })

  // Built by hand rather than with NextResponse.redirect(): the target is a
  // custom scheme, and this keeps the Location header exactly as composed.
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
    },
  })
}
