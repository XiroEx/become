import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const progress = await MindProgress.findOne({ userId: auth.userId }).lean()
    return NextResponse.json({ vision: progress?.vision ?? null })
  } catch (err) {
    console.error('GET /api/mind/vision error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { habits, mind, body: bodyText, relationships, environment, identityStatement } = body as {
      habits?: string
      mind?: string
      body?: string
      relationships?: string
      environment?: string
      identityStatement?: string
    }

    await dbConnect()

    // Check if this is a first-time vision (grant more XP)
    const existing = await MindProgress.findOne({ userId: auth.userId }).lean()
    const isFirstVision = !existing?.vision?.completedAt

    const now = new Date()
    const visionUpdate: Record<string, unknown> = { 'vision.updatedAt': now }

    if (habits !== undefined) visionUpdate['vision.habits'] = habits.trim()
    if (mind !== undefined) visionUpdate['vision.mind'] = mind.trim()
    if (bodyText !== undefined) visionUpdate['vision.body'] = bodyText.trim()
    if (relationships !== undefined) visionUpdate['vision.relationships'] = relationships.trim()
    if (environment !== undefined) visionUpdate['vision.environment'] = environment.trim()
    if (identityStatement !== undefined) visionUpdate['vision.identityStatement'] = identityStatement.trim()

    // Mark as completed if all fields present
    const allFields = [habits, mind, bodyText, relationships, environment, identityStatement]
    const isComplete = allFields.every(f => f && f.trim().length > 0)
    if (isComplete && isFirstVision) {
      visionUpdate['vision.completedAt'] = now
    }

    // Grant XP: 75 first time, 15 for updates
    const xpGrant = isFirstVision && isComplete ? 75 : 15

    const updated = await MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      {
        $set: visionUpdate,
        $inc: { xp: xpGrant },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({
      vision: updated?.vision ?? null,
      xpGained: xpGrant,
      xp: updated?.xp ?? 0,
    })
  } catch (err) {
    console.error('POST /api/mind/vision error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
