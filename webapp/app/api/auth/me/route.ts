import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import { getTokenFromRequest, verifyToken } from '../../../../lib/auth'

export async function GET(req: Request) {
  try {
    const token = getTokenFromRequest(req)
    if (!token) return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })

    const payload = verifyToken(token)
    await dbConnect()
    const user = await User.findById(payload.userId).select('-password')
    if (!user) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })

    return new Response(JSON.stringify({ user }), { status: 200 })
  } catch (err: any) {
    console.error('me error', err)
    return new Response(JSON.stringify({ message: err.message || 'Server error' }), { status: 500 })
  }
}
