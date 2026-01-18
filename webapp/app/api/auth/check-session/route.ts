import dbConnect from '@/lib/mongodb'
import { checkSession } from '@/models/MagicLink'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sessionId } = body

    if (!sessionId) {
      return new Response(JSON.stringify({ message: 'Session ID is required' }), { status: 400 })
    }

    await dbConnect()

    const result = await checkSession(sessionId)

    // If verified, also set HTTP-only cookie for persistent auth
    if (result.status === 'verified' && result.authToken) {
      const cookieMaxAge = 7 * 24 * 60 * 60 // 7 days in seconds
      return new Response(JSON.stringify(result), { 
        status: 200,
        headers: {
          'Set-Cookie': `auth_token=${result.authToken}; HttpOnly; Path=/; Max-Age=${cookieMaxAge}; SameSite=Lax; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`
        }
      })
    }

    return new Response(JSON.stringify(result), { status: 200 })

  } catch (err: unknown) {
    console.error('check-session error', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return new Response(JSON.stringify({ message }), { status: 500 })
  }
}
