// GET  /api/mind/session?tz=  — is today's Mind session already done?
// POST /api/mind/session       — mark today's session complete (idempotent per
//   local day). First completion of the day grants a flat XP reward to
//   MindProgress; replays award nothing. Returns updated chapter/xp + whether
//   the user is now ready to level up (so the payoff screen can hint it).

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindSession from '@/models/MindSession'
import MindProgress from '@/models/MindProgress'
import { readTzOffset, readTzOffsetFromBody, localDateKey } from '@/lib/dayWindow'
import { getXpToNextChapter, isReadyToLevelUp } from '@/lib/mindXP'

const SESSION_REWARD_XP = 15

// Consecutive-day streak of completed Mind sessions, anchored to the caller's
// local day. Counts today if done, otherwise starts from yesterday (so the
// streak holds until the day actually lapses).
function computeStreak(dateKeys: string[], todayKey: string): number {
  const set = new Set(dateKeys)
  const toDate = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

  const today = toDate(todayKey)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  let cursor: Date
  if (set.has(todayKey)) cursor = today
  else if (set.has(fmt(yesterday))) cursor = yesterday
  else return 0

  let streak = 0
  while (set.has(fmt(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

async function streakFor(userId: string, todayKey: string): Promise<number> {
  const docs = await MindSession.find({ userId })
    .select('dateKey')
    .sort({ dateKey: -1 })
    .limit(120)
    .lean<{ dateKey: string }[]>()
  return computeStreak(docs.map((d) => d.dateKey), todayKey)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tz = readTzOffset(searchParams)
    const dateKey = localDateKey(null, tz)

    await dbConnect()
    const doc = await MindSession.findOne({ userId: auth.userId, dateKey }).lean()
    const streak = await streakFor(auth.userId!, dateKey)

    return NextResponse.json({ dateKey, completedToday: !!doc, streak })
  } catch (err) {
    console.error('GET /api/mind/session error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const tz = readTzOffsetFromBody(body)
    const dateKey = localDateKey(null, tz)
    const moves = Array.isArray((body as { moves?: { kind: string }[] }).moves)
      ? (body as { moves: { kind: string }[] }).moves.map((m) => ({ kind: String(m.kind), completedAt: new Date() }))
      : []

    await dbConnect()

    // Atomic upsert: when a new doc is inserted, findOneAndUpdate with new:false
    // returns null — that's how we detect (and gate XP to) the first completion.
    const prior = await MindSession.findOneAndUpdate(
      { userId: auth.userId, dateKey },
      { $setOnInsert: { userId: auth.userId, dateKey, moves, xpAwarded: SESSION_REWARD_XP, completedAt: new Date() } },
      { upsert: true, new: false },
    )

    const firstToday = prior === null
    let xpAwarded = 0

    if (firstToday) {
      xpAwarded = SESSION_REWARD_XP
      await MindProgress.findOneAndUpdate(
        { userId: auth.userId },
        { $inc: { xp: SESSION_REWARD_XP } },
        { upsert: true, setDefaultsOnInsert: true },
      ).catch(() => {})
    }

    const progress = await MindProgress.findOne({ userId: auth.userId }).lean<{ chapter?: number; xp?: number } | null>()
    const chapter = progress?.chapter ?? 1
    const xp = progress?.xp ?? 0
    const streak = await streakFor(auth.userId!, dateKey)

    return NextResponse.json({
      alreadyComplete: !firstToday,
      xpAwarded,
      chapter,
      xp,
      streak,
      xpProgress: getXpToNextChapter(chapter, xp),
      readyToLevelUp: isReadyToLevelUp(chapter, xp),
    })
  } catch (err) {
    console.error('POST /api/mind/session error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
