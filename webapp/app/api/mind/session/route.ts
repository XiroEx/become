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

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tz = readTzOffset(searchParams)
    const dateKey = localDateKey(null, tz)

    await dbConnect()
    const doc = await MindSession.findOne({ userId: auth.userId, dateKey }).lean()

    return NextResponse.json({ dateKey, completedToday: !!doc })
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

    return NextResponse.json({
      alreadyComplete: !firstToday,
      xpAwarded,
      chapter,
      xp,
      xpProgress: getXpToNextChapter(chapter, xp),
      readyToLevelUp: isReadyToLevelUp(chapter, xp),
    })
  } catch (err) {
    console.error('POST /api/mind/session error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
