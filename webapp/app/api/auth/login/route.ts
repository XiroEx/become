import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import { signToken } from '../../../../lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return new Response(JSON.stringify({ message: 'Missing fields' }), { status: 400 })
    }

    await dbConnect()

    const user = await User.findOne({ email })
    if (!user) {
      return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 })
    }

    // comparePassword is defined on schema methods
    const match = await (user as any).comparePassword(password)
    if (!match) {
      return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 })
    }

    const token = signToken({ userId: String(user._id), email: user.email })

    return new Response(JSON.stringify({ token, user: { id: user._id, name: user.name, email: user.email } }), { status: 200 })
  } catch (err: any) {
    console.error('login error', err)
    return new Response(JSON.stringify({ message: err.message || 'Server error' }), { status: 500 })
  }
}
