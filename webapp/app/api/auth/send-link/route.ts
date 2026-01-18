import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { createMagicLink } from '@/models/MagicLink'
import { sendVerificationEmail } from '@/lib/email'

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, name, mode } = body

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
      if (!name) {
        return new Response(JSON.stringify({ message: 'Name is required for registration' }), { status: 400 })
      }
      if (existingUser) {
        return new Response(JSON.stringify({ message: 'Email already in use. Please sign in instead.' }), { status: 409 })
      }
    }

    // For login mode, we'll create the user if they don't exist (passwordless flow)
    // This provides a seamless experience

    // Create magic link
    const magicLink = await createMagicLink(trimmedEmail, mode, name)

    // Send verification email
    await sendVerificationEmail(trimmedEmail, magicLink.token, mode, name, origin)

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
  const originHeader = req.headers.get('origin')
  if (originHeader) return originHeader

  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = req.headers.get('x-forwarded-host')
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`

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

  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}
