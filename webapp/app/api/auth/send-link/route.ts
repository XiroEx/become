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

    // Get the origin from request headers for callback URL
    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
      message: 'Verification email sent. Please check your inbox.' 
    }), { status: 200 })

  } catch (err: unknown) {
    console.error('send-link error', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return new Response(JSON.stringify({ message }), { status: 500 })
  }
}
