import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meditation from '@/models/Meditation'
import { verifyAuth } from '@/lib/auth'

// GET — last 30 sessions + computed stats
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const sessions = await Meditation.find({ userId: auth.userId })
      .sort({ completedAt: -1 })
      .limit(30)
      .lean()

    // Stats
    const all = await Meditation.find({ userId: auth.userId }).lean()

    const totalMinutes = all.reduce((s, e) => s + e.durationMinutes, 0)
    const totalSessions = all.length

    // This week (Mon–Sun)
    const now = new Date()
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1 // Mon=0
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    const thisWeek = all.filter((e) => new Date(e.completedAt) >= weekStart).length

    // Streak — consecutive days with at least one session
    const uniqueDates = [
      ...new Set(
        all.map((e) => new Date(e.completedAt).toISOString().slice(0, 10)),
      ),
    ].sort((a, b) => b.localeCompare(a)) // descending

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let streakDays = 0
    const cursor = new Date(today)
    for (const dateStr of uniqueDates) {
      const d = new Date(dateStr + 'T00:00:00')
      if (d.getTime() === cursor.getTime()) {
        streakDays++
        cursor.setDate(cursor.getDate() - 1)
      } else if (d.getTime() < cursor.getTime()) {
        break
      }
    }

    // Check if already meditated today
    const todayStr = today.toISOString().slice(0, 10)
    const meditatedToday = uniqueDates.includes(todayStr)

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
