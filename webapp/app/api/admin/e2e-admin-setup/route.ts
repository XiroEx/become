import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'

const BOOTSTRAP_TOKEN = 'e2e-user-setup-2026'
const E2E_ADMIN_EMAIL = 'e2eadmin@become.io'

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

    let userId: string

    const existing = await User.findOne({ email: E2E_ADMIN_EMAIL }).lean()
    if (!existing) {
      const newUser = new User({
        email: E2E_ADMIN_EMAIL,
        name: 'E2E Admin User',
        password: 'e2e-placeholder-not-used',
        role: 'admin',
        onboardingCompleted: true,
        profile: {
          age: 30,
          biologicalSex: 'male',
          heightCm: 180,
          currentWeightKg: 80,
          fitnessGoal: 'gain_muscle',
          experienceLevel: 'intermediate',
          weightUnit: 'lbs',
        },
      })
      const saved = await newUser.save()
      userId = saved._id!.toString()
    } else {
      userId = existing._id!.toString()
      await User.updateOne(
        { email: E2E_ADMIN_EMAIL },
        { $set: { role: 'admin', onboardingCompleted: true } }
      )
    }

    const authToken = jwt.sign(
      { userId, email: E2E_ADMIN_EMAIL, role: 'admin' },
      secret,
      { expiresIn: '24h' }
    )

    return NextResponse.json({ userId, email: E2E_ADMIN_EMAIL, token: authToken })
  } catch (error) {
    console.error('E2E admin setup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
