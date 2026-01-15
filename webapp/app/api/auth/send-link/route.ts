import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { createMagicLink } from '@/models/MagicLink'
import { sendVerificationEmail } from '@/lib/email'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, name, mode } = body

    if (!email) {
      return new Response(JSON.stringify({ message: 'Email is required' }), { status: 400 })
    }

    if (!mode || !['login', 'register'].includes(mode)) {
      return new Response(JSON.stringify({ message: 'Invalid mode' }), { status: 400 })
    }

    await dbConnect()

    // Check if user exists
    const existingUser = await User.findOne({ email })

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
    const magicLink = await createMagicLink(email, mode, name)

    // Send verification email
    await sendVerificationEmail(email, magicLink.token, mode, name)

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
