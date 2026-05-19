import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Journal from '@/models/Journal'
import { verifyAuth } from '@/lib/auth'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  localDayWindowForKey,
  utcMidnightDateKey,
} from '@/lib/dayWindow'

// GET - returns last 30 entries + today's entry
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const tzOffset = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tzOffset)
    const { start, end } = localDayWindowForKey(todayKey, tzOffset)

    const entries = await Journal.find({ userId: authResult.userId })
      .sort({ date: -1 })
      .limit(30)
      .lean()

    const todayEntry = entries.find((e) => {
      const t = new Date(e.date).getTime()
      return t >= start.getTime() && t <= end.getTime()
    }) ?? null

    return NextResponse.json({ entries, todayEntry })
  } catch (error) {
    console.error('Error fetching journal entries:', error)
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 })
  }
}

// POST - create or update today's entry (upsert)
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { content, mood, prompt } = body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    if (content.length > 5000) {
      return NextResponse.json({ error: 'Content exceeds maximum length of 5000 characters' }, { status: 400 })
    }

    if (mood !== undefined && ![1, 2, 3, 4, 5].includes(mood)) {
      return NextResponse.json({ error: 'Invalid mood value' }, { status: 400 })
    }

    await dbConnect()

    const tzOffset = readTzOffsetFromBody(body)
    const todayKey = localDateKey(null, tzOffset)
    const today = utcMidnightDateKey(todayKey)
    const { start, end } = localDayWindowForKey(todayKey, tzOffset)

    const updateFields: Record<string, unknown> = { content: content.trim() }
    if (mood !== undefined) updateFields.mood = mood
    if (prompt !== undefined) updateFields.prompt = prompt

    // Use the local-day window to find an existing entry, then upsert keyed by
    // the canonical UTC-midnight date so storage is consistent across timezones.
    const existingEntry = await Journal.findOne({
      userId: authResult.userId,
      date: { $gte: start, $lte: end },
    })

    const entry = await Journal.findOneAndUpdate(
      { userId: authResult.userId, date: existingEntry ? existingEntry.date : today },
      { $set: updateFields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({ entry })
  } catch (error) {
    console.error('Error saving journal entry:', error)
    return NextResponse.json({ error: 'Failed to save journal entry' }, { status: 500 })
  }
}
