// POST /api/auth/apple — SIGN IN WITH APPLE, the whole server side of it.
//
//   { identityToken, nonce, authorizationCode?, fullName? }
//     → { token, user, isNew, matchedBy, canLinkEmail }
//
// The device has already talked to Apple (expo-apple-authentication); what
// arrives here is Apple's identity token and the nonce the device raised. This
// route does four things and refuses at the first one that fails:
//
//   1. VERIFY the token against Apple's public keys — issuer, audience
//      (io.redbtn.become), the nonce and expiry, with no clock tolerance.
//      lib/apple/identityToken.ts carries the argument for each check; the
//      short version is that Apple signs every app's tokens with the same
//      keys, so a signature alone proves nothing about who the token is for.
//   2. RESOLVE the member: Apple's subject first, then a verified real email
//      ONCE, else create — lib/authBridge.ts#bridgeAppleToBecomeSession.
//      Never by a relay alias: that is how a member ends up with two
//      accounts.
//   3. EXCHANGE the authorization code for a refresh token, so account
//      deletion can revoke the grant through Apple's REST API (Apple requires
//      it of every app that offers Sign in with Apple). BEST EFFORT: a member
//      must not be locked out because Apple's token endpoint had a bad minute
//      or because the .p8 has not been pasted into the runtime config yet. It
//      is logged, and the next sign-in tries again.
//   4. MINT the same Become JWT every other auth path mints, and set the same
//      7-day cookie, so everything downstream — verifyAuth, the web
//      middleware, the native session store — is unchanged.
//
// A REFUSED TOKEN IS A 401 WITH A REASON. The caller already holds the token,
// so naming the failure ('wrong_audience', 'expired', 'nonce_mismatch') gives
// away nothing and is the difference between a debuggable store build and a
// silent one.

import { NextRequest, NextResponse } from 'next/server'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { authCookie, bridgeAppleToBecomeSession } from '@/lib/authBridge'
import {
  AppleTokenError,
  verifyAppleIdentityToken,
  type AppleIdentity,
} from '@/lib/apple/identityToken'
import {
  exchangeAppleAuthorizationCode,
  resolveAppleCredentials,
} from '@/lib/apple/rest'
import { appleDisplayName } from '@/lib/apple/fullName'

export const dynamic = 'force-dynamic'

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null)
    const identityToken = str((body as { identityToken?: unknown } | null)?.identityToken)
    const nonce = str((body as { nonce?: unknown } | null)?.nonce)

    if (!identityToken || !nonce) {
      return NextResponse.json(
        { error: 'identityToken and nonce are required' },
        { status: 400 },
      )
    }

    const { apple } = await getRuntimeConfig()
    // The bundle id is the audience for a token minted for the iOS app; the
    // Services ID is there for the day the web offers the button too, and is
    // simply absent until then.
    const audience = [apple.bundleId, apple.serviceId].filter((v): v is string => Boolean(v))

    let identity: AppleIdentity
    try {
      identity = await verifyAppleIdentityToken({ identityToken, nonce, audience })
    } catch (err) {
      if (err instanceof AppleTokenError) {
        console.warn(`[apple] identity token refused: ${err.reason}`)
        return NextResponse.json(
          { error: 'apple_token_rejected', reason: err.reason },
          { status: 401 },
        )
      }
      throw err
    }

    // Step 3 — best effort, and loudly logged when it does not land, because
    // without a refresh token there is nothing for deletion to revoke.
    let refreshToken: string | undefined
    const authorizationCode = str((body as { authorizationCode?: unknown } | null)?.authorizationCode)
    if (authorizationCode) {
      const creds = resolveAppleCredentials(apple)
      if (!creds) {
        console.error(
          '[apple] no Apple service credentials configured (apple.teamId / keyId /'
            + ' privateKey): the authorization code cannot be exchanged, so account'
            + ' deletion will have no token to revoke',
        )
      } else {
        try {
          const exchanged = await exchangeAppleAuthorizationCode(authorizationCode, creds)
          refreshToken = exchanged.refreshToken
          if (!refreshToken) {
            console.error('[apple] the code exchange returned no refresh_token')
          }
        } catch (error) {
          console.error('[apple] authorization code exchange failed:', error)
        }
      }
    }

    const result = await bridgeAppleToBecomeSession({
      sub: identity.sub,
      email: identity.email,
      emailVerified: identity.emailVerified,
      isPrivateEmail: identity.isPrivateEmail,
      name: appleDisplayName((body as { fullName?: unknown } | null)?.fullName),
      refreshToken,
    })

    console.log(
      `[apple] sign-in user=${result.user.id} matchedBy=${result.matchedBy}`
        + ` private=${identity.isPrivateEmail} canLinkEmail=${result.canLinkEmail}`
        + ` refreshToken=${refreshToken ? 'stored' : 'none'}`,
    )

    const res = NextResponse.json({
      token: result.token,
      user: result.user,
      isNew: result.isNew,
      matchedBy: result.matchedBy,
      // The app shows "Already a member? Link your email" on this.
      canLinkEmail: result.canLinkEmail,
    })
    res.headers.append('Set-Cookie', authCookie(result.token))
    return res
  } catch (error) {
    console.error('POST /api/auth/apple error:', error)
    return NextResponse.json({ error: 'apple_sign_in_failed' }, { status: 500 })
  }
}
