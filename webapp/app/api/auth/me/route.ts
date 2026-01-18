import { NextRequest } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import { verifyToken } from '../../../../lib/auth'

export async function GET(req: NextRequest) {
  try {
    // Check for token in Authorization header first
    const authHeader = req.headers.get('authorization')
    let token: string | undefined
    let fromCookie = false

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }

    // Fall back to cookie
    if (!token) {
      token = req.cookies.get('auth_token')?.value
      fromCookie = true
    }

    if (!token) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    }

    const payload = verifyToken(token)
    await dbConnect()
    const user = await User.findById(payload.userId).select('-password')
    if (!user) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })

    // If token came from cookie, include it in response so client can sync to localStorage
    return new Response(JSON.stringify({ 
      user,
      ...(fromCookie && { token })
    }), { status: 200 })
  } catch (err: unknown) {
    console.error('me error', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return new Response(JSON.stringify({ message }), { status: 500 })
  }
}
