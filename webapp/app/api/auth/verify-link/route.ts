import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import MagicLink, { verifyMagicLink, storeAuthToken } from '@/models/MagicLink'
import { signToken, authCookie } from '@/lib/auth'

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

    const { email, mode, name } = magicLink

    let user = await User.findOne({ email })

    try {
      if (mode === 'register') {
        if (user) {
          // User already exists, just log them in
          const jwtToken = signToken({ userId: String(user._id), email: user.email, role: user.role || 'user' })
          await storeAuthToken(token, jwtToken)
          return new Response(JSON.stringify({
            token: jwtToken,
            user: { id: user._id, name: user.name, email: user.email }
          }), { status: 200 })
        }

        // Create new user
        user = new User({
          name: name || email.split('@')[0],
          email,
          password: 'magic-link-auth-no-password'
        })
        await user.save()
      } else {
        // Login mode
        if (!user) {
          // Create user if they don't exist (passwordless signup via login)
          user = await User.create({
            name: email.split('@')[0],
            email,
            password: 'magic-link-auth-no-password'
          })
        }
      }

      const jwtToken = signToken({ userId: String(user._id), email: user.email, role: user.role || 'user' })

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
