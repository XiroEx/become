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

// PROGRESSION XP per completion within a local day — diminishing so replays still
// move you forward without farming a whole chapter in one sitting. completion 4+ = 0.
const XP_BY_COMPLETION: Record<number, number> = { 1: 15, 2: 8, 3: 5 }

// The "Becoming score" (xpBank) accrues from EVERY completion, including training
// reps after progression XP is spent — so volume is always rewarded even though it
// can't rush the arc. Banks the progression XP when there is some, else a flat
// training amount so the score never stalls.
const TRAINING_BANK = 3

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
    // Recency for session spacing (breath cooldown + modality variety).
    const prog = await MindProgress.findOne({ userId: auth.userId })
      .select('lastBreathAt recentKinds')
      .lean<{ lastBreathAt?: Date; recentKinds?: string[] } | null>()

    return NextResponse.json({
      dateKey,
      completedToday: !!doc,
      streak,
      lastBreathAt: prog?.lastBreathAt ? new Date(prog.lastBreathAt).getTime() : null,
      recentKinds: prog?.recentKinds ?? [],
    })
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

    // Replays are allowed — users can train more than once a day. XP diminishes
    // per completion (and stops) so extra reps still move you forward without
    // letting you farm a level in one sitting. Atomic $inc gives the completion #.
    const doc = await MindSession.findOneAndUpdate(
      { userId: auth.userId, dateKey },
      {
        $inc: { completions: 1 },
        $setOnInsert: { userId: auth.userId, dateKey },
        $set: { moves, completedAt: new Date() },
      },
      { upsert: true, new: true },
    )
    const n = doc?.completions ?? 1
    const xpAwarded = XP_BY_COMPLETION[n] ?? 0
    // Every rep banks something toward the lifetime Becoming score.
    const banked = xpAwarded > 0 ? xpAwarded : TRAINING_BANK

    // Recency tracking for session spacing: remember when breath last ran (so it
    // can be spaced out) and the modalities used (so the next session can vary).
    // `moves` are the EFFECTIVE kinds the player actually showed (post state-swap).
    const kinds = moves.map((m) => m.kind)
    const didBreath = kinds.includes('breath')
    const recencySet: Record<string, unknown> = {
      recentKinds: kinds.filter((k) => k !== 'state-check'),
    }
    if (didBreath) recencySet.lastBreathAt = new Date()

    // Always bank toward the lifetime score; only progression xp diminishes.
    const inc: Record<string, number> = { xpBank: banked }
    if (xpAwarded > 0) inc.xp = xpAwarded
    await MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      { $inc: inc, $set: recencySet },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => {})
    if (xpAwarded > 0) {
      await MindSession.updateOne({ userId: auth.userId, dateKey }, { $inc: { xpAwarded } }).catch(() => {})
    }

    const progress = await MindProgress.findOne({ userId: auth.userId })
      .lean<{ chapter?: number; xp?: number; xpBank?: number; lastGrowthAt?: Date } | null>()
    const chapter = progress?.chapter ?? 1
    const xp = progress?.xp ?? 0
    const xpBank = progress?.xpBank ?? 0
    const streak = await streakFor(auth.userId!, dateKey)

    // Gate the arc: at most one growth moment (level-up) per local day, so volume
    // can't rush the story. Extra reps stay full sessions that bank score (training).
    const grewToday = progress?.lastGrowthAt
      ? localDateKey(null, tz, new Date(progress.lastGrowthAt)) === dateKey
      : false
    const readyToLevelUp = isReadyToLevelUp(chapter, xp) && !grewToday

    return NextResponse.json({
      completions: n,
      xpAwarded,
      banked,
      xpBank,
      trainingMode: xpAwarded === 0,
      chapter,
      xp,
      streak,
      xpProgress: getXpToNextChapter(chapter, xp),
      readyToLevelUp,
      gatedByGrowth: isReadyToLevelUp(chapter, xp) && grewToday,
    })
  } catch (err) {
    console.error('POST /api/mind/session error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
