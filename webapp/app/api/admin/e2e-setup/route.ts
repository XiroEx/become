import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'

const BOOTSTRAP_TOKEN = 'e2e-user-setup-2026'
const E2E_EMAIL = 'e2etest@become.io'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-bootstrap-token')
    if (token !== BOOTSTRAP_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'JWT_SECRET not configured' }, { status: 500 })
    }

    await connectDB()

    // Find or create the test user
    let userId: string

    const existing = await User.findOne({ email: E2E_EMAIL }).lean()
    if (!existing) {
      const newUser = new User({
        email: E2E_EMAIL,
        name: 'E2E Test User',
        password: 'e2e-placeholder-not-used',
        role: 'user',
        onboardingCompleted: false,
        profile: {},
      })
      const saved = await newUser.save()
      userId = saved._id!.toString()
    } else {
      userId = existing._id!.toString()
      await User.updateOne(
        { email: E2E_EMAIL },
        { $set: { onboardingCompleted: false, profile: {}, savedPrograms: [] } }
      )
    }

    // Clear active programs and workout logs so user starts fresh
    await UserProgress.updateOne(
      { userId },
      { $set: { activePrograms: [], workoutLogs: [] } }
    )

    // 24-hour JWT for e2e test sessions
    const authToken = jwt.sign(
      { userId, email: E2E_EMAIL, role: 'user' },
      secret,
      { expiresIn: '24h' }
    )

    return NextResponse.json({ userId, email: E2E_EMAIL, token: authToken })
  } catch (error) {
    console.error('E2E setup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
