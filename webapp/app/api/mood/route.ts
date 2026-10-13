import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'
import { bustTilesCache } from '@/lib/redis'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  isEntryOnDay,
  daysSinceEntry,
  resolveEntryDay,
  isStaleReplay,
} from '@/lib/dayWindow'

// Check if mood has been logged today and return today's mood
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      // For unauthenticated users, check localStorage on client side
      return NextResponse.json({ needsMoodCheck: true, todaysMood: null, daysSinceLastEntry: 0 })
    }

    await dbConnect()

    const progress = await UserProgress.findOne({ userId: authResult.userId }).lean()

    if (!progress || !progress.moodHistory || progress.moodHistory.length === 0) {
      return NextResponse.json({ needsMoodCheck: true, todaysMood: null, daysSinceLastEntry: 999 })
    }

    const tzOffset = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tzOffset)
    // Mood rows are day-keyed (UTC-midnight markers), so they must be matched as
    // calendar days. Matching them against a local-instant window reported
    // "no mood today" the moment a member west of UTC logged one.
    const todaysMood = progress.moodHistory.find((entry: { date: Date; mood: number }) =>
      isEntryOnDay(entry.date, todayKey, tzOffset)
    )

    let daysSinceLastEntry = 0
    if (progress.moodHistory.length > 0) {
      const newest = progress.moodHistory.reduce((a: { date: Date }, b: { date: Date }) =>
        new Date(b.date).getTime() > new Date(a.date).getTime() ? b : a
      )
      daysSinceLastEntry = daysSinceEntry(newest.date, todayKey, tzOffset) ?? 0
    }

    return NextResponse.json({
      needsMoodCheck: !todaysMood,
      todaysMood: todaysMood?.mood || null,
      daysSinceLastEntry
    })
  } catch (error) {
    console.error('Error checking mood:', error)
    return NextResponse.json({ needsMoodCheck: true, todaysMood: null, daysSinceLastEntry: 0 })
  }
}

// Log mood for today (records change history)
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mood } = body

    if (!mood || ![1, 2, 3, 4, 5].includes(mood)) {
      return NextResponse.json({ error: 'Invalid mood value' }, { status: 400 })
    }

    await dbConnect()

    const tzOffset = readTzOffsetFromBody(body)
    const now = new Date()

    // Which local day this mood belongs to. Without `date` on the body that is
    // today in the caller's offset — unchanged for every client that sends
    // none. With one, the client is telling us the day the mood was logged on,
    // so a write queued offline before midnight and delivered after it lands on
    // the day the member actually felt it.
    const entryDay = resolveEntryDay(body, tzOffset, { now })
    if (!entryDay.ok) {
      return NextResponse.json({ error: entryDay.error }, { status: 400 })
    }
    const { dayKey: entryKey, date: entryDate, loggedAt, backdated } = entryDay

    // Find or create user progress
    let progress = await UserProgress.findOne({ userId: authResult.userId })

    // A replay carrying an older `loggedAt` than the value already stored for
    // the day changes nothing — `storedMood` is then what the member keeps.
    let applied = true
    let storedMood: 1 | 2 | 3 | 4 | 5 = mood

    if (!progress) {
      // Create new progress record with initial mood
      progress = await UserProgress.create({
        userId: authResult.userId,
        moodHistory: [{ date: entryDate, loggedAt, mood }],
        moodChangeHistory: [{
          timestamp: now,
          date: entryDate,
          previousMood: null,
          newMood: mood
        }]
      })
    } else {
      // Check if there's already a mood entry for that day. Matched by calendar
      // day: the local-instant window never matched the day-keyed row a member
      // west of UTC had just written, so every log appended a duplicate row for
      // the same day instead of updating it.
      const existingIndex = progress.moodHistory?.findIndex((entry: { date: Date }) => {
        return isEntryOnDay(entry.date, entryKey, tzOffset)
      }) ?? -1

      let previousMood: 1 | 2 | 3 | 4 | 5 | null = null

      if (existingIndex >= 0) {
        // Get previous mood before updating
        previousMood = progress.moodHistory[existingIndex].mood
        // The same day can arrive twice — once from the device that was online,
        // once from an offline queue draining later. The later DELIVERY is not
        // necessarily the later LOG, so the newer `loggedAt` wins and the stale
        // replay is accepted but ignored.
        if (isStaleReplay(progress.moodHistory[existingIndex].loggedAt, loggedAt)) {
          applied = false
          storedMood = previousMood ?? mood
        } else {
          // Update existing entry
          progress.moodHistory[existingIndex].mood = mood
          progress.moodHistory[existingIndex].loggedAt = loggedAt
        }
      } else {
        // Add new entry
        if (!progress.moodHistory) {
          progress.moodHistory = []
        }
        progress.moodHistory.push({ date: entryDate, loggedAt, mood })
      }

      // Always record the change in history (even if mood is the same, for
      // audit trail) — but a stale replay changed nothing, so there is no
      // change to record.
      if (applied) {
        if (!progress.moodChangeHistory) {
          progress.moodChangeHistory = []
        }
        progress.moodChangeHistory.push({
          timestamp: now,
          date: entryDate,
          previousMood,
          newMood: mood
        })
      }

      await progress.save()
    }

    // A BACK-DATED mood does not touch the streak: recordStreakActivity only
    // ever credits the day it runs on, so replaying last Tuesday's mood would
    // hand the member a streak day for today they did not earn. Past streak
    // days are left exactly as they were — the deliberate default.
    const streakResult = backdated
      ? null
      : await recordStreakActivity(authResult.userId!, authResult.email).catch(() => null)

    // Mood feeds dashboard tiles — invalidate so the change shows immediately.
    await bustTilesCache(authResult.userId!)

    return NextResponse.json({
      success: true,
      mood: storedMood,
      date: entryKey,
      // False only when a stale replay lost to a newer value for the same day.
      // The request still succeeded — there is nothing for the client to retry.
      applied,
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          newMilestone: streakResult.newMilestone,
        },
      }),
    })
  } catch (error) {
    console.error('Error saving mood:', error)
    return NextResponse.json({ error: 'Failed to save mood' }, { status: 500 })
  }
}
