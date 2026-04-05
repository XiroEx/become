import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'

// One-time admin endpoint — remove after use
// Requires header: x-admin-key matching JWT_SECRET env var
export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key')
  const secret = process.env.JWT_SECRET

  if (!secret || adminKey !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  const result = await User.updateMany(
    {},
    { $set: { onboardingCompleted: false } }
  )

  return NextResponse.json({
    message: 'Onboarding reset for all users',
    modifiedCount: result.modifiedCount,
    matchedCount: result.matchedCount,
  })
}
