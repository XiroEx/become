/**
 * Tracked workouts done OUTSIDE Become, imported from Apple Health / Health
 * Connect (card 6adf69c7, Part B). `lib/workout/externalWorkouts.ts` has Jon's
 * rules in full; this file is the wire.
 *
 *   POST — a batch of sessions from the phone's launch sync. Each one is
 *          applied, recognised as a duplicate, or refused, and answered per
 *          item: one bad sample from a tracker must not cost the other 49.
 *   GET  — the sessions on a range of local days, for both calendars. A new
 *          route rather than a field on `GET /api/schedule`, so the schedule
 *          contract (NP-021) does not move for an extra activity that is not
 *          part of any schedule.
 *
 * `verifyAuth` is default-deny for scoped tokens, so a widgets token can read
 * neither half — only a full session imports or lists anything.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { recordStreakActivity } from '@/lib/streak'
import { bustTilesCache } from '@/lib/redis'
import { readTzOffset, readTzOffsetFromBody, localDateKey, utcMidnightDateKey, dateKey } from '@/lib/dayWindow'
import {
  EXTERNAL_WORKOUT_MAX_BATCH,
  readExternalWorkout,
  toExternalWorkoutView,
  toStoredExternalWorkout,
  type StoredExternalWorkout,
} from '@/lib/workout/externalWorkouts'

/** The widest range one GET may ask for: a calendar shows a month at a time. */
const MAX_RANGE_DAYS = 400
/** With no range at all: the window an import can reach, ending today. */
const DEFAULT_RANGE_DAYS = 90

interface ItemResult {
  externalId: string | null
  source: string | null
  /** The session's local day, when it was valid enough to have one. */
  date?: string
  applied: boolean
  duplicate?: boolean
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const rawWorkouts = (body as { workouts?: unknown } | null)?.workouts
    if (!Array.isArray(rawWorkouts) || rawWorkouts.length === 0) {
      return NextResponse.json({ error: 'workouts must be a non-empty array' }, { status: 400 })
    }
    if (rawWorkouts.length > EXTERNAL_WORKOUT_MAX_BATCH) {
      return NextResponse.json(
        { error: `At most ${EXTERNAL_WORKOUT_MAX_BATCH} workouts per request` },
        { status: 400 },
      )
    }

    // `tz` decides only what "today" is for the future/too-old checks and the
    // streak's same-day rule. Each session's DAY is its own `date`.
    const tzOffset = readTzOffsetFromBody(body)
    const now = new Date()
    const todayKey = localDateKey(null, tzOffset, now)
    const userId = auth.userId

    await dbConnect()

    // The push below is a conditional update with no upsert (an upsert whose
    // filter fails on an existing document would collide with the unique
    // userId index), so the document has to exist first.
    await UserProgress.updateOne(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true },
    )

    const results: ItemResult[] = []
    let creditsToday = false

    for (const raw of rawWorkouts) {
      const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const read = readExternalWorkout(raw, tzOffset, now)
      if (!read.ok) {
        results.push({
          externalId: typeof rec.externalId === 'string' ? rec.externalId : null,
          source: typeof rec.source === 'string' ? rec.source : null,
          applied: false,
          error: read.error,
        })
        continue
      }
      const entry = read.entry

      // Insert-if-absent, atomically: Health re-offers the whole window on
      // every sync, and two syncs racing (launch + foreground) must still land
      // the session once. The same `$not $elemMatch` shape the quick-session
      // save uses for its sessionId.
      const res = await UserProgress.updateOne(
        {
          userId,
          externalWorkouts: { $not: { $elemMatch: { source: entry.source, externalId: entry.externalId } } },
        },
        { $push: { externalWorkouts: toStoredExternalWorkout(entry, now) } },
      )
      const applied = res.modifiedCount > 0
      results.push({
        externalId: entry.externalId,
        source: entry.source,
        date: entry.dayKey,
        applied,
        ...(applied ? {} : { duplicate: true }),
      })
      // Only a session from TODAY is today's workout, and only the first
      // delivery of it — the same rule as an imported weigh-in (PR #2215). A
      // session from an earlier day is history: it fills in the calendar and
      // that day's trained count, but streak days are only ever credited on
      // the day they happen.
      if (applied && !entry.backdated && entry.dayKey === todayKey) creditsToday = true
    }

    let streak = null
    if (creditsToday) {
      streak = await recordStreakActivity(userId, auth.email).catch(() => null)
    }

    if (results.some((r) => r.applied)) {
      await bustTilesCache(userId).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      results,
      ...(streak && {
        streak: {
          streakDays: streak.streakDays,
          streakExtended: streak.streakExtended,
          newMilestone: streak.newMilestone,
        },
      }),
    })
  } catch (error) {
    console.error('Error importing external workouts:', error)
    return NextResponse.json({ error: 'Failed to import workouts' }, { status: 500 })
  }
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

function isDayKey(v: string | null): v is string {
  if (!v || !DAY_KEY.test(v)) return false
  return dateKey(utcMidnightDateKey(v), 0) === v
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = request.nextUrl.searchParams
    const tzOffset = readTzOffset(params)
    const fromRaw = params.get('from')
    const toRaw = params.get('to')
    if ((fromRaw && !isDayKey(fromRaw)) || (toRaw && !isDayKey(toRaw))) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
    }

    const toKey = toRaw ?? localDateKey(null, tzOffset)
    const toMarker = utcMidnightDateKey(toKey)
    const fromKey = fromRaw ?? dateKey(new Date(toMarker.getTime() - DEFAULT_RANGE_DAYS * 86_400_000), 0)
    const fromMarker = utcMidnightDateKey(fromKey)
    if (fromMarker.getTime() > toMarker.getTime()) {
      return NextResponse.json({ error: 'from must not be after to' }, { status: 400 })
    }
    if ((toMarker.getTime() - fromMarker.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `A range may span at most ${MAX_RANGE_DAYS} days` }, { status: 400 })
    }

    await dbConnect()
    const doc = await UserProgress.findOne({ userId: auth.userId })
      .select('externalWorkouts')
      .lean<{ externalWorkouts?: StoredExternalWorkout[] } | null>()

    // Both ends are day MARKERS, compared as markers: an inclusive range of
    // local days, never an instant window.
    const workouts = (doc?.externalWorkouts ?? [])
      .filter((w) => {
        const t = new Date(w.date).getTime()
        return t >= fromMarker.getTime() && t <= toMarker.getTime()
      })
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .map(toExternalWorkoutView)

    return NextResponse.json({ from: fromKey, to: toKey, workouts })
  } catch (error) {
    console.error('Error reading external workouts:', error)
    return NextResponse.json({ error: 'Failed to read workouts' }, { status: 500 })
  }
}
