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

    const user = await User.findOne({ email })
    if (!user) {
      return new Response(JSON.stringify({ message: 'No account found for this email' }), { status: 404 })
    }

    const token = signToken({ userId: String(user._id), email: user.email, role: user.role })

    return new Response(JSON.stringify({ token, user: { id: user._id, name: user.name, email: user.email } }), { status: 200 })
  } catch (err: any) {
    console.error('login error', err)
    return new Response(JSON.stringify({ message: err.message || 'Server error' }), { status: 500 })
  }
}
