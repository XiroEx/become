import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import { signToken } from '../../../../lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, password } = body

    if (!name || !email || !password) {
      return new Response(JSON.stringify({ message: 'Missing fields' }), { status: 400 })
    }

    await dbConnect()

    const existing = await User.findOne({ email })
    if (existing) {
      return new Response(JSON.stringify({ message: 'Email already in use' }), { status: 409 })
    }

    const user = new User({ name, email, password })
    await user.save()

    const token = signToken({ userId: String(user._id), email: user.email })

    return new Response(JSON.stringify({ token, user: { id: user._id, name: user.name, email: user.email } }), { status: 201 })
  } catch (err: any) {
    console.error('register error', err)
    return new Response(JSON.stringify({ message: err.message || 'Server error' }), { status: 500 })
  }
}
