import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meditation from '@/models/Meditation'
import { verifyAuth } from '@/lib/auth'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  localDayWindowForKey,
  dateKey,
} from '@/lib/dayWindow'

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

    // Stats
    const all = await Meditation.find({ userId: auth.userId }).lean()

    const totalMinutes = all.reduce((s, e) => s + e.durationMinutes, 0)
    const totalSessions = all.length

    // This week (Mon–Sun) — derive Monday from user's local today
    // todayKey is YYYY-MM-DD; compute day-of-week from it
    const [ty, tm, td] = todayKey.split('-').map(Number)
    const todayDow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() // 0=Sun
    const daysFromMon = todayDow === 0 ? 6 : todayDow - 1 // Mon=0
    const mondayKey = (() => {
      const d = new Date(Date.UTC(ty, tm - 1, td - daysFromMon))
      const y = d.getUTCFullYear()
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
      const dy = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${mo}-${dy}`
    })()
    const { start: weekStart } = localDayWindowForKey(mondayKey, tz)
    const thisWeek = all.filter((e) => new Date(e.completedAt) >= weekStart).length

    // Streak — consecutive days with at least one session, using local date keys
    const uniqueDates = [
      ...new Set(
        all.map((e) => dateKey(new Date(e.completedAt), tz)),
      ),
    ].sort((a, b) => b.localeCompare(a)) // descending

    let streakDays = 0
    // Walk backwards from today
    let cursorKey = todayKey
    for (const ds of uniqueDates) {
      if (ds === cursorKey) {
        streakDays++
        // Move cursor back one day
        const [cy, cm, cd] = cursorKey.split('-').map(Number)
        const prev = new Date(Date.UTC(cy, cm - 1, cd - 1))
        cursorKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`
      } else if (ds < cursorKey) {
        break
      }
    }

    // Check if already meditated today
    const meditatedToday = uniqueDates.includes(todayKey)

    return NextResponse.json({
      sessions,
      stats: { totalMinutes, totalSessions, thisWeek, streakDays, meditatedToday },
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
