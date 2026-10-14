/**
 * Daily check-in gating.
 *
 * The dashboard used to decide this itself by calling /api/mood and /api/weight,
 * reading only each one's `daysSinceLastEntry`, OR-ing them, and throttling with
 * a localStorage timestamp. That is why members who saved a check-in or pressed
 * "Skip for Today" kept seeing it again: neither action made the OR false, so the
 * 8-hour stamp was the only thing holding it back, and 24/8 meant three prompts a
 * day. See lib/checkin/status.ts for the rule this replaces it with.
 *
 * GET  → everything the dashboard needs to decide and to render the modal.
 * POST → record that we showed it ('shown') or that the member dismissed the
 *        day ('skip').
 */

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  utcMidnightDateKey,
  isEntryOnDay,
  daysSinceEntry,
} from '@/lib/dayWindow'
import { checkInDecision } from '@/lib/checkin/status'
import { checkInFactsForToday, checkInTzOffset } from '@/lib/checkin/todayFacts'

/** Sentinel for "no entry has ever been logged", rendered as "First log". */
const NEVER_LOGGED = 999

type Entry = { date: Date }

/** The row this member logged on `todayKey`, if any. */
function entryOnDay(entries: Entry[] | undefined, todayKey: string, tz: number) {
  if (!entries?.length) return undefined
  return entries.find((e) => isEntryOnDay(e.date, todayKey, tz))
}

/** Calendar days between the newest entry and today. */
function daysSince(entries: Entry[] | undefined, todayKey: string, tz: number) {
  if (!entries?.length) return NEVER_LOGGED
  const newest = entries.reduce((a, b) =>
    new Date(b.date).getTime() > new Date(a.date).getTime() ? b : a,
  )
  return daysSinceEntry(newest.date, todayKey, tz) ?? NEVER_LOGGED
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ due: false, reason: 'unauthenticated' })
    }

    await dbConnect()
    const progress = await UserProgress.findOne({ userId: auth.userId }).lean()

    const tz = readTzOffset(request.nextUrl.searchParams)
    // Check-in's own day, not the calendar's — see lib/checkin/todayFacts.
    const checkInTz = checkInTzOffset(tz)
    const todayKey = localDateKey(null, checkInTz)

    if (!progress) {
      // A brand-new member has logged nothing, so the check-in is genuinely due.
      return NextResponse.json({
        due: true,
        reason: 'due',
        complete: false,
        moodLoggedToday: false,
        weightLoggedToday: false,
        skippedToday: false,
        daysSinceMood: NEVER_LOGGED,
        daysSinceWeight: NEVER_LOGGED,
        todaysMood: null,
        lastWeight: null,
        lastWeightUnit: null,
      })
    }

    const moodHistory = (progress.moodHistory ?? []) as (Entry & { mood: number })[]
    const weightHistory = (progress.weightHistory ?? []) as (Entry & {
      weight: number
      unit?: 'lbs' | 'kg'
    })[]

    const todaysMoodEntry = entryOnDay(moodHistory, todayKey, checkInTz) as
      | (Entry & { mood: number })
      | undefined
    const todaysWeightEntry = entryOnDay(weightHistory, todayKey, checkInTz) as
      | (Entry & { weight: number })
      | undefined

    const { skippedToday } = checkInFactsForToday(progress, todayKey, checkInTz)

    const lastShownAt = progress.checkIn?.lastShownAt ?? null

    const decision = checkInDecision({
      moodLoggedToday: !!todaysMoodEntry,
      weightLoggedToday: !!todaysWeightEntry,
      skippedToday,
      lastShownAt,
    })

    const newestWeight = weightHistory.length
      ? weightHistory.reduce((a, b) =>
          new Date(b.date).getTime() > new Date(a.date).getTime() ? b : a,
        )
      : undefined
    // `lastWeight` is the RAW stored number and it prefills the check-in's
    // weight field, so the client has to know which unit it is in before
    // putting it under a "Current Weight (kg)" label. The entry's own unit is
    // the answer; absent (logged before the field existed) is the client's
    // grandfather case, read as the member's display unit there.
    const lastWeightUnit =
      newestWeight?.unit === 'kg' || newestWeight?.unit === 'lbs' ? newestWeight.unit : null

    return NextResponse.json({
      ...decision,
      moodLoggedToday: !!todaysMoodEntry,
      weightLoggedToday: !!todaysWeightEntry,
      skippedToday,
      daysSinceMood: daysSince(moodHistory, todayKey, checkInTz),
      daysSinceWeight: daysSince(weightHistory, todayKey, checkInTz),
      todaysMood: todaysMoodEntry?.mood ?? null,
      lastWeight: newestWeight?.weight ?? null,
      lastWeightUnit,
    })
  } catch (error) {
    console.error('Error resolving check-in status:', error)
    // Fail closed: a broken read must not spam the member with a modal.
    return NextResponse.json({ due: false, reason: 'error' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const action = (body as { action?: string }).action
    if (action !== 'shown' && action !== 'skip') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    await dbConnect()

    const tz = readTzOffsetFromBody(body)
    const todayKey = localDateKey(null, tz)
    const today = utcMidnightDateKey(todayKey)
    // checkIn.lastSkippedDate closes the check-in's OWN day (4am-rolling — see
    // lib/checkin/todayFacts), not the calendar day used below for
    // weightSkipTracking, which is a separate, untouched feature.
    const checkInTodayKey = localDateKey(null, checkInTzOffset(tz))
    const checkInToday = utcMidnightDateKey(checkInTodayKey)

    const now = new Date()

    if (action === 'shown') {
      // Targeted update, not progress.save().
      // save() validates the WHOLE UserProgress document, so one malformed legacy
      // subdocument anywhere in it — a workout set missing `setNumber`, say —
      // threw here and returned a 500 from a daily member action.
      await UserProgress.updateOne(
        { userId: auth.userId },
        {
          $set: {
            'checkIn.lastShownAt': now,
          },
        },
        { upsert: true },
      )

      return NextResponse.json({ success: true })
    }

    // action === 'skip'
    // Skipping is a per-DAY event. The old flow POSTed {skip:true} to
    // /api/weight on every press, which incremented consecutiveSkips each
    // time — so three presses in one day read as three skipped days and
    // dragged the member toward the 14-day "mandatory" weigh-in in under a
    // week. Only the first skip of a local day counts.
    const progress = await UserProgress.findOne({ userId: auth.userId })
    const lastPrompt = progress?.weightSkipTracking?.lastPromptDate
    const alreadyCountedToday = lastPrompt && isEntryOnDay(lastPrompt, todayKey, tz)
    const currentSkips = progress?.weightSkipTracking?.consecutiveSkips || 0
    const consecutiveSkips = alreadyCountedToday ? currentSkips : currentSkips + 1

    // Targeted update, not progress.save().
    // save() validates the WHOLE UserProgress document, so one malformed legacy
    // subdocument anywhere in it — a workout set missing `setNumber`, say —
    // threw here and returned a 500 from a daily member action.
    await UserProgress.updateOne(
      { userId: auth.userId },
      {
        $set: {
          'checkIn.lastSkippedDate': checkInToday,
          'checkIn.lastShownAt': now,
          'weightSkipTracking.consecutiveSkips': consecutiveSkips,
          'weightSkipTracking.lastPromptDate': today,
        },
      },
      { upsert: true },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error recording check-in action:', error)
    return NextResponse.json({ error: 'Failed to record check-in' }, { status: 500 })
  }
}
