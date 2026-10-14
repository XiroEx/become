import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meditation from '@/models/Meditation'
import { verifyAuth } from '@/lib/auth'
import {
  readTzOffset,
  localDateKey,
} from '@/lib/dayWindow'
import { computeMeditationStats } from '@/lib/meditation'

// GET — last 30 sessions + computed stats
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const tz = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tz)

    const sessions = await Meditation.find({ userId: auth.userId })
      .sort({ completedAt: -1 })
      .limit(30)
      .lean()

    // Note: MeditationSchema already has index { userId: 1, completedAt: -1 }.
    // A covering index on { userId: 1, completedAt: -1, durationMinutes: 1 } could satisfy
    // the stats projection entirely from index, but per ticket instructions no index is added in this card.
    // When the member has fewer than 30 sessions, `sessions` already contains their entire history.
    // Otherwise, project only completedAt and durationMinutes across their full history.
    const history =
      sessions.length < 30
        ? sessions
        : await Meditation.find(
            { userId: auth.userId },
            'completedAt durationMinutes'
          ).lean()

    const stats = computeMeditationStats(history, tz, todayKey)

    return NextResponse.json({
      sessions,
      stats,
    })
  } catch (err) {
    console.error('[GET /api/meditation]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST — log a completed session
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { categoryId, categoryName, durationMinutes } = body

    if (!categoryId || !categoryName || !durationMinutes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await dbConnect()

    const session = await Meditation.create({
      userId: auth.userId,
      categoryId,
      categoryName,
      durationMinutes,
      completedAt: new Date(),
    })

    return NextResponse.json({ session }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/meditation]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
