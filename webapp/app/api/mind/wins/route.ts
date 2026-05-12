import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import DailyWin from '@/models/DailyWin'
import {
  readTzOffsetFromBody,
  localDateKey,
  utcMidnightDateKey,
} from '@/lib/dayWindow'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const wins = await DailyWin.find({ userId: auth.userId })
      .sort({ date: -1 })
      .limit(7)
      .lean()

    return NextResponse.json({ wins })
  } catch (err) {
    console.error('GET /api/mind/wins error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { win } = body as { win?: string }
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (!win || win.trim().length < 3) {
      return NextResponse.json({ error: 'Win text required' }, { status: 400 })
    }

    await dbConnect()

    // Stamp the win with the caller's LOCAL day at UTC midnight, so a win
    // logged at 11pm in a zone west of UTC lands on the user's "today" row
    // rather than spilling into "tomorrow UTC".
    const today = utcMidnightDateKey(localDateKey(null, tzOffsetMinutes))

    // Allow multiple wins per day — just append
    const doc = await DailyWin.create({
      userId: auth.userId,
      date: today,
      win: win.trim(),
    })

    return NextResponse.json({ win: doc })
  } catch (err) {
    console.error('POST /api/mind/wins error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
