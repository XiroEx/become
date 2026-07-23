import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('x-admin-key')
    const { auth } = await getRuntimeConfig()
    const secret = auth.jwtSecret

    if (!secret || adminKey !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email } = body as { email: string }

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    await connectDB()

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { $set: { role: 'admin' } },
      { new: true }
    ).lean()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      message: 'User promoted to admin',
      email: user.email,
      role: user.role,
    })
  } catch (error) {
    console.error('Admin bootstrap error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
