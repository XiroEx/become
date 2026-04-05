import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import { verifyAdmin } from '@/lib/adminAuth'

// Admin utility endpoint
// Accepts either: x-admin-key header matching JWT_SECRET, OR Bearer token from an admin user
// Body: { userId?: string } — if userId provided, resets that user only; otherwise resets all
export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key')
  const secret = process.env.JWT_SECRET

  // Allow x-admin-key auth (legacy/script usage)
  const keyAuthed = secret && adminKey === secret

  // Also allow admin Bearer token auth (UI usage)
  if (!keyAuthed) {
    const adminResult = await verifyAdmin(req)
    if (!adminResult.success) {
      return NextResponse.json({ error: adminResult.error ?? 'Unauthorized' }, { status: adminResult.status ?? 401 })
    }
  }

  await connectDB()

  let body: { userId?: string } = {}
  try {
    body = await req.json()
  } catch {
    // No body or invalid JSON — default to reset all
  }

  const { userId } = body

  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
    }

    const result = await User.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { onboardingCompleted: false } }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      message: 'Onboarding reset for user',
      userId,
      modifiedCount: result.modifiedCount,
    })
  }

  // Reset all users
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
