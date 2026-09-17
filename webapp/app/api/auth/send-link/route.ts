import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import MagicLink, { createMagicLink } from '@/models/MagicLink'
import { sendVerificationEmail } from '@/lib/email'
import { LEGAL_VERSION } from '@/lib/legal'

// Per-email throttle window. Blocks email-spam abuse and accidental
// double-submits without inconveniencing real users — 30s is short enough
// they'll just check their inbox.
const SEND_LINK_COOLDOWN_MS = 30 * 1000

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, mode, consent } = body

    if (!email) {
      return new Response(JSON.stringify({ message: 'Email is required' }), { status: 400 })
    }

    // Validate email format
    const trimmedEmail = email.trim().toLowerCase()
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return new Response(JSON.stringify({ message: 'Please enter a valid email address' }), { status: 400 })
    }

    if (!mode || !['login', 'register'].includes(mode)) {
      return new Response(JSON.stringify({ message: 'Invalid mode' }), { status: 400 })
    }

    // Derive origin from request (prefers forwarded headers, falls back to host) so emails use the caller's domain
    const origin = getRequestOrigin(req)

    await dbConnect()

    // Check if user exists
    const existingUser = await User.findOne({ email: trimmedEmail })

    if (mode === 'register') {
      // No name is asked for here any more — onboarding collects it. A client
      // that still sends one is not refused, it is simply ignored; the name on
      // the account comes from the member, not from the sign-up payload.
      if (existingUser) {
        return new Response(JSON.stringify({ message: 'Email already in use. Please sign in instead.' }), { status: 409 })
      }
      // The sign-up form cannot submit without the tick (the box is
      // `required`), so a register request arriving without it is a client
      // that is not the form. Refuse rather than create an account nobody
      // agreed to. Login mode is untouched: the in-app gate covers a member
      // who lands there without an account.
      if (consent !== true) {
        return new Response(JSON.stringify({ message: 'Please agree to the Terms of Service and Privacy Policy to create an account.' }), { status: 400 })
      }
    }

    // For login mode, we'll create the user if they don't exist (passwordless flow)
    // This provides a seamless experience

    // Throttle: don't allow another send-link for the same email within the
    // cooldown window. Stops attackers spamming verification emails to a
    // victim's inbox and stops legitimate double-submits from sending two.
    const cooldownStart = new Date(Date.now() - SEND_LINK_COOLDOWN_MS)
    const recent = await MagicLink.findOne(
      { email: trimmedEmail, createdAt: { $gt: cooldownStart } },
      { createdAt: 1 },
    ).lean<{ createdAt: Date } | null>()
    if (recent) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((SEND_LINK_COOLDOWN_MS - (Date.now() - new Date(recent.createdAt).getTime())) / 1000),
      )
      return new Response(
        JSON.stringify({
          message: `A link was just sent. Check your inbox or try again in ${retryAfterSec}s.`,
        }),
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }

    // Create magic link
    // The version rides on the link so the agreement lands on the User row at
    // the instant the row is created (verify-link), stamped with the text that
    // was actually on the screen when the box was ticked.
    const magicLink = await createMagicLink(
      trimmedEmail,
      mode,
      mode === 'register' && consent === true ? LEGAL_VERSION : undefined,
    )

    // Send verification email
    await sendVerificationEmail(trimmedEmail, magicLink.token, mode, origin)

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Verification email sent. Please check your inbox.',
      sessionId: magicLink.sessionId
    }), { status: 200 })

  } catch (err: unknown) {
    console.error('send-link error', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return new Response(JSON.stringify({ message }), { status: 500 })
  }
}

function getRequestOrigin(req: Request) {
  // Prefer the statically configured app URL in production
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL
  if (configuredUrl) return configuredUrl

  const originHeader = req.headers.get('origin')
  if (originHeader) return originHeader

  // x-forwarded-proto can contain comma-separated values when multiple proxies
  // are in the chain (e.g. "http,http" or "https,http"). Take only the first.
  const rawProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedProto = rawProto.split(',')[0].trim()
  const forwardedHost = req.headers.get('x-forwarded-host')
  // Strip any accidentally-included protocol from x-forwarded-host
  if (forwardedHost) return `${forwardedProto}://${forwardedHost.replace(/^https?:\/\//, '')}`

  const referer = req.headers.get('referer')
  if (referer) {
    try {
      const refererUrl = new URL(referer)
      return `${refererUrl.protocol}//${refererUrl.host}`
    } catch (err) {
      console.warn('Invalid referer header for origin detection', referer, err)
    }
  }

  const host = req.headers.get('host')
  if (host) return `${forwardedProto}://${host}`

  try {
    const url = new URL(req.url)
    return `${url.protocol}//${url.host}`
  } catch (err) {
    // If we reach here, the request is malformed and cannot determine origin
    console.error('Failed to parse request URL for origin detection')
    throw new Error('Cannot determine request origin from headers or URL')
  }
}
