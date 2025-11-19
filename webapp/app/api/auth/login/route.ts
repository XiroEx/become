import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import { signToken } from '../../../../lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email } = body

    if (!email) {
      return new Response(JSON.stringify({ message: 'Email is required' }), { status: 400 })
    }

    await dbConnect()

    // TODO: Remove this - allowing all logins for testing with email code
    let user = await User.findOne({ email })
    if (!user) {
      // Create a test user if they don't exist
      user = await User.create({
        name: email.split('@')[0],
        email,
        password: 'dummy-password-not-used' // Will be hashed by the User model
      })
    }

    const token = signToken({ userId: String(user._id), email: user.email })

    return new Response(JSON.stringify({ token, user: { id: user._id, name: user.name, email: user.email } }), { status: 200 })
  } catch (err: any) {
    console.error('login error', err)
    return new Response(JSON.stringify({ message: err.message || 'Server error' }), { status: 500 })
  }
}
