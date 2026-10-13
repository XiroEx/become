import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import MagicLink, { verifyMagicLink, storeAuthToken } from '@/models/MagicLink'
import { signToken, authCookie } from '@/lib/auth'
import { LEGAL_MINIMUM_AGE } from '@/lib/legal'
import { fallbackNameFromEmail } from '@/lib/displayName'
import { completeAppleEmailLink } from '@/lib/appleLink'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { token } = body

    if (!token) {
      return new Response(JSON.stringify({ message: 'Token is required' }), { status: 400 })
    }

    await dbConnect()

    // Verify the magic link
    const magicLink = await verifyMagicLink(token)

    if (!magicLink) {
      return new Response(JSON.stringify({ 
        message: 'This link has expired or is invalid. Please request a new one.' 
      }), { status: 400 })
    }

    const { email, mode, name, consentTermsVersion, appleLinkUserId } = magicLink

    // "Already a member? Link your email" (lib/appleLink.ts). This link was
    // sent to the member's REAL address on behalf of the account Apple's relay
    // alias had just created, and clicking it is the proof that the two are
    // one person. The Apple subject moves onto the account that owns this
    // address and the throwaway row is purged, so the member ends with ONE
    // account — then the session is minted for it exactly as below.
    //
    // It is handled before everything else because `mode` is 'login' and the
    // ordinary path would happily sign them into the right account while
    // leaving the duplicate in place.
    if (appleLinkUserId) {
      const outcome = await completeAppleEmailLink({ appleUserId: appleLinkUserId, email })
      if (!outcome.ok || !outcome.user) {
        // The link is already consumed; un-consume it so a transient refusal
        // is retryable, the same way a failed save below is.
        await MagicLink.updateOne({ token }, { $set: { used: false } })
        console.error(`[apple-link] merge refused: ${outcome.reason}`)
        return new Response(JSON.stringify({
          message: 'We could not link that email to your Apple sign-in. Please try again from the app.',
          reason: outcome.reason,
        }), { status: 400 })
      }
      const linked = outcome.user
      const jwtToken = await signToken({
        userId: String(linked._id),
        email: linked.email,
        role: linked.role || 'user',
      })
      await storeAuthToken(token, jwtToken)
      console.log(
        `[apple-link] linked user=${String(linked._id)} merged=${outcome.merged}`
          + ` purgedRows=${outcome.purgedRows ?? 0}`,
      )
      return new Response(JSON.stringify({
        token: jwtToken,
        user: { id: linked._id, name: linked.name, email: linked.email },
        appleLinked: true,
      }), { status: 200, headers: { 'Set-Cookie': authCookie(jwtToken) } })
    }

    let user = await User.findOne({ email })

    try {
      if (mode === 'register') {
        if (user) {
          // User already exists, just log them in
          const jwtToken = await signToken({ userId: String(user._id), email: user.email, role: user.role || 'user' })
          await storeAuthToken(token, jwtToken)
          return new Response(JSON.stringify({
            token: jwtToken,
            user: { id: user._id, name: user.name, email: user.email }
          }), { status: 200 })
        }

        // Create new user. The agreement the sign-up form collected is written
        // in the same save as the row itself, so there is never a member who
        // exists without the record of what they agreed to. A link minted
        // without one (an older client) still creates the account; the in-app
        // gate asks on first open.
        //
        // `name` is only ever set on a link minted by a build that still had a
        // name box on the sign-up form. Sign-up asks for an email alone now, so
        // the placeholder below is what a new member starts with and onboarding
        // replaces it with a real answer.
        user = new User({
          name: name || fallbackNameFromEmail(email),
          email,
          password: 'magic-link-auth-no-password',
          ...(consentTermsVersion
            ? {
                consent: {
                  termsVersion: consentTermsVersion,
                  acceptedAt: new Date(),
                  minimumAge: LEGAL_MINIMUM_AGE,
                  source: 'signup',
                },
              }
            : {}),
        })
        await user.save()
      } else {
        // Login mode
        if (!user) {
          // Create user if they don't exist (passwordless signup via login)
          user = await User.create({
            name: fallbackNameFromEmail(email),
            email,
            password: 'magic-link-auth-no-password'
          })
        }
      }

      const jwtToken = await signToken({ userId: String(user._id), email: user.email, role: user.role || 'user' })

      // Store the JWT for the polling session
      await storeAuthToken(token, jwtToken)

      // Set HTTP-only cookie for persistent auth. Rolls on each /api/auth/me.
      return new Response(JSON.stringify({
        token: jwtToken,
        user: { id: user._id, name: user.name, email: user.email }
      }), {
        status: 200,
        headers: {
          'Set-Cookie': authCookie(jwtToken)
        }
      })
    } catch (saveErr) {
      // Rollback: un-consume the magic link so the user can try again
      await MagicLink.updateOne({ token }, { $set: { used: false } })
      throw saveErr
    }

  } catch (err: unknown) {
    console.error('verify-link error', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return new Response(JSON.stringify({ message }), { status: 500 })
  }
}
