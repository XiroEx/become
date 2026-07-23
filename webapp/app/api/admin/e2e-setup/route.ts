import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

const E2E_EMAIL = 'e2etest@become.io'

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('x-bootstrap-token')
    const { admin, auth } = await getRuntimeConfig()
    if (!admin.bootstrapToken || token !== admin.bootstrapToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Clear active programs, workout logs, and persisted PRs so user starts fresh
    await UserProgress.updateOne(
      { userId },
      { $set: { activePrograms: [], workoutLogs: [], exercisePRs: [] } }
    )

    // 24-hour JWT for e2e test sessions
    const authToken = jwt.sign(
      { userId, email: E2E_EMAIL, role: 'user' },
      auth.jwtSecret,
      { expiresIn: '24h' }
    )

    return NextResponse.json({ userId, email: E2E_EMAIL, token: authToken })
  } catch (error) {
    console.error('E2E setup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
