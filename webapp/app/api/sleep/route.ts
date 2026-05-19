import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Sleep from '@/models/Sleep'
import { verifyAuth } from '@/lib/auth'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  localDayWindowForKey,
  utcMidnightDateKey,
} from '@/lib/dayWindow'

// GET — returns last 14 days of entries + today's entry if any + averages
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const tz = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tz)
    const { start: todayStart } = localDayWindowForKey(todayKey, tz)

    // 14-day window: start from local midnight 13 days before today
    const fourteenDaysAgoKey = (() => {
      const d = new Date(todayStart)
      d.setUTCDate(d.getUTCDate() - 13)
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    })()
    const { start: windowStart } = localDayWindowForKey(fourteenDaysAgoKey, tz)

    const entries = await Sleep.find({
      userId: authResult.userId,
      date: { $gte: windowStart }
    })
      .sort({ date: -1 })
      .lean()

    const { start: todayWindowStart, end: todayWindowEnd } = localDayWindowForKey(todayKey, tz)
    const todayEntry = entries.find((entry) => {
      const d = new Date(entry.date)
      return d >= todayWindowStart && d <= todayWindowEnd
    }) || null

    // Calculate averages across all returned entries
    let averages = { durationMinutes: 0, quality: 0 }
    if (entries.length > 0) {
      const totalDuration = entries.reduce((sum, e) => sum + e.durationMinutes, 0)
      const totalQuality = entries.reduce((sum, e) => sum + e.quality, 0)
      averages = {
        durationMinutes: Math.round(totalDuration / entries.length),
        quality: Math.round((totalQuality / entries.length) * 10) / 10
      }
    }

    return NextResponse.json({
      entries: entries.map((e) => ({
        _id: e._id,
        date: e.date,
        bedtime: e.bedtime,
        wakeTime: e.wakeTime,
        durationMinutes: e.durationMinutes,
        quality: e.quality,
        notes: e.notes
      })),
      todayEntry: todayEntry
        ? {
            _id: todayEntry._id,
            date: todayEntry.date,
            bedtime: todayEntry.bedtime,
            wakeTime: todayEntry.wakeTime,
            durationMinutes: todayEntry.durationMinutes,
            quality: todayEntry.quality,
            notes: todayEntry.notes
          }
        : null,
      averages
    })
  } catch (error) {
    console.error('Error fetching sleep entries:', error)
    return NextResponse.json({ error: 'Failed to fetch sleep entries' }, { status: 500 })
  }
}

// POST — log or update today's sleep
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { bedtime, wakeTime, quality, notes } = body

    // Validate required fields
    if (!bedtime || !wakeTime) {
      return NextResponse.json({ error: 'bedtime and wakeTime are required' }, { status: 400 })
    }

    if (!quality || ![1, 2, 3, 4, 5].includes(quality)) {
      return NextResponse.json({ error: 'quality must be 1-5' }, { status: 400 })
    }

    const bedtimeDate = new Date(bedtime)
    const wakeTimeDate = new Date(wakeTime)

    if (isNaN(bedtimeDate.getTime()) || isNaN(wakeTimeDate.getTime())) {
      return NextResponse.json({ error: 'Invalid bedtime or wakeTime' }, { status: 400 })
    }

    // Calculate duration server-side
    const durationMinutes = Math.round(
      (wakeTimeDate.getTime() - bedtimeDate.getTime()) / (1000 * 60)
    )

    if (durationMinutes < 0 || durationMinutes > 1440) {
      return NextResponse.json(
        { error: 'Sleep duration must be between 0 and 1440 minutes' },
        { status: 400 }
      )
    }

    await dbConnect()

    const tz = readTzOffsetFromBody(body)
    const todayKey = localDateKey(null, tz)
    const storageDate = utcMidnightDateKey(todayKey)
    const { start: todayWindowStart, end: todayWindowEnd } = localDayWindowForKey(todayKey, tz)

    const entry = await Sleep.findOneAndUpdate(
      { userId: authResult.userId, date: { $gte: todayWindowStart, $lte: todayWindowEnd } },
      {
        userId: authResult.userId,
        date: storageDate,
        bedtime: bedtimeDate,
        wakeTime: wakeTimeDate,
        durationMinutes,
        quality,
        ...(notes !== undefined ? { notes } : {})
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({
      success: true,
      entry: {
        _id: entry._id,
        date: entry.date,
        bedtime: entry.bedtime,
        wakeTime: entry.wakeTime,
        durationMinutes: entry.durationMinutes,
        quality: entry.quality,
        notes: entry.notes
      }
    })
  } catch (error) {
    console.error('Error saving sleep entry:', error)
    return NextResponse.json({ error: 'Failed to save sleep entry' }, { status: 500 })
  }
}
