import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Mission from '@/models/Mission'
import MindProgress from '@/models/MindProgress'
import { readTzOffset, readTzOffsetFromBody, localDateKey } from '@/lib/dayWindow'

const DAY_MS = 86_400_000

// A momentum streak is "alive" only if the last forward move was today or
// yesterday; otherwise the day was missed and the display resets to 0.
function momentumView(
  m: { momentumStreak?: number; longestMomentumStreak?: number; lastMovedKey?: string | null } | null,
  tz: number,
) {
  if (!m) return { streak: 0, longest: 0, movedToday: false }
  const today = localDateKey(null, tz)
  const yesterday = localDateKey(null, tz, new Date(Date.now() - DAY_MS))
  const alive = m.lastMovedKey === today || m.lastMovedKey === yesterday
  return {
    streak: alive ? (m.momentumStreak ?? 0) : 0,
    longest: m.longestMomentumStreak ?? 0,
    movedToday: m.lastMovedKey === today,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const tz = readTzOffset(new URL(request.url).searchParams)
    const mission = await Mission.findOne({ userId: auth.userId }).lean()
    return NextResponse.json({ mission: mission ?? null, momentum: momentumView(mission, tz) })
  } catch (err) {
    console.error('GET /api/mind/mission error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH { action: 'move', tz } — "I moved forward today." Advances the momentum
// streak idempotently per local day. Movement is the whole point of Mission.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    if (body.action !== 'move') {
      return NextResponse.json({ error: 'action must be "move"' }, { status: 400 })
    }
    const tz = readTzOffsetFromBody(body)

    await dbConnect()
    const doc = await Mission.findOne({ userId: auth.userId })
    if (!doc) return NextResponse.json({ error: 'Set your mission first' }, { status: 404 })

    const today = localDateKey(null, tz)
    const yesterday = localDateKey(null, tz, new Date(Date.now() - DAY_MS))
    if (doc.lastMovedKey !== today) {
      doc.momentumStreak = doc.lastMovedKey === yesterday ? (doc.momentumStreak ?? 0) + 1 : 1
      doc.lastMovedKey = today
      doc.longestMomentumStreak = Math.max(doc.longestMomentumStreak ?? 0, doc.momentumStreak)
      await doc.save()
    }
    return NextResponse.json({
      momentum: { streak: doc.momentumStreak, longest: doc.longestMomentumStreak, movedToday: true },
    })
  } catch (err) {
    console.error('PATCH /api/mind/mission error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { purpose, whyItMatters, dailyAction } = body as {
      purpose?: string
      whyItMatters?: string
      dailyAction?: string
    }

    if (!purpose || !whyItMatters || !dailyAction) {
      return NextResponse.json({ error: 'purpose, whyItMatters, and dailyAction are required' }, { status: 400 })
    }

    await dbConnect()

    const existing = await Mission.findOne({ userId: auth.userId }).lean()

    const mission = await Mission.findOneAndUpdate(
      { userId: auth.userId },
      { purpose, whyItMatters, dailyAction },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    // Grant XP on first mission set (fire-and-forget)
    if (!existing) {
      MindProgress.updateOne({ userId: auth.userId }, { $inc: { xp: 25 } }).catch(() => {})
    }

    return NextResponse.json({ mission })
  } catch (err) {
    console.error('PUT /api/mind/mission error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
