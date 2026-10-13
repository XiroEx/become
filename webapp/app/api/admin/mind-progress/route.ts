// Admin-only Mind progress controls. Targets the admin's OWN account by default,
// or any user via `userId` in the body (used by the admin user-detail page).
//
//   GET  → the full live picture (level, chapter, the counters that DERIVE them,
//          and the 20h main-session gate)
//   POST → { userId?, ... } with one of:
//            reset: true             full wipe back to a brand-new account
//            resetDailySession: true clear TODAY's session gate only (keeps progress)
//            { chapter?, level?, xp? } set a value
//
// WHY THIS FILE IS CAREFUL ABOUT DERIVED FIELDS
// Level and chapter are NOT stored directly — they are derived on read in
// /api/mind/progress:
//   chapter = max(storedChapter, chapterFromSessions(mainSessionCount))
//   level   = getLevelProgress(levelXp).level
// The old reset wrote `chapter: 1, xp: 0` and nothing else, so:
//   • mainSessionCount survived → the next read re-derived the OLD chapter, and
//     the reset looked like it silently did nothing
//   • levelXp survived → the level never moved
//   • lastMainSessionAt survived → the 20h cooldown stayed, so the main session
//     was still locked behind Training Grounds after a "fresh start"
// Anything that writes chapter or level here MUST also write the counter that
// derives it, or the write is cosmetic.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { requireAdmin } from '@/lib/adminAuth'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'
import { readTzOffsetFromBody, localDateKey } from '@/lib/dayWindow'
import {
  MAIN_SESSION_COOLDOWN_MS,
  chapterFromSessions,
  getLevelProgress,
  mainSessionAvailable,
  sessionsIntoChapter,
} from '@/lib/mindXP'
import { resetUpdate, chapterUpdate, levelUpdate } from '@/lib/mind/adminProgressOps'

interface ProgressDoc {
  chapter?: number
  xp?: number
  xpBank?: number
  levelXp?: number
  mainSessionCount?: number
  lastMainSessionAt?: Date
  introducedSystems?: string[]
}

/** The same derivations the app itself does, so the admin screen shows what the
 *  user will actually see rather than the raw stored values. */
async function snapshot(userId: string, tzOffset: number) {
  const p = await MindProgress.findOne({ userId }).lean<ProgressDoc | null>()
  const storedChapter = p?.chapter ?? 1
  const mainSessionCount = p?.mainSessionCount ?? 0
  const levelXp = p?.levelXp ?? 0
  const chapter = Math.max(storedChapter, chapterFromSessions(mainSessionCount))
  const level = getLevelProgress(levelXp)
  const lastMainAt = p?.lastMainSessionAt ? new Date(p.lastMainSessionAt).getTime() : null
  const available = mainSessionAvailable(p?.lastMainSessionAt)

  const dateKey = localDateKey(null, tzOffset)
  const todayDoc = await MindSession.findOne({ userId, dateKey }).lean<{ completions?: number } | null>()
  const totalSessions = await MindSession.countDocuments({ userId })

  return {
    // Derived — what the user sees.
    chapter,
    level: level.level,
    levelProgress: level,
    // Raw — what actually drives the derivation. Surfaced so a broken reset is
    // visible on the screen instead of being guessed at.
    storedChapter,
    mainSessionCount,
    sessionsIntoChapter: sessionsIntoChapter(mainSessionCount),
    levelXp,
    xp: p?.xp ?? 0,
    xpBank: p?.xpBank ?? 0,
    introducedSystems: p?.introducedSystems ?? [],
    // The 20h main-session gate.
    mainSessionAvailable: available,
    lastMainSessionAt: lastMainAt,
    nextMainSessionAt: available ? null : (lastMainAt ?? 0) + MAIN_SESSION_COOLDOWN_MS,
    // Today's daily doc (streak + "already done today").
    dateKey,
    completedToday: !!todayDoc,
    completionsToday: todayDoc?.completions ?? 0,
    totalSessionDays: totalSessions,
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  await dbConnect()
  const tz = Number(new URL(request.url).searchParams.get('tz'))
  return NextResponse.json(await snapshot(gate.userId, Number.isFinite(tz) ? tz : 0))
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  let body: {
    userId?: string
    chapter?: number
    level?: number
    xp?: number
    reset?: boolean
    resetDailySession?: boolean
    tz?: number
  } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body ok */
  }

  // Target any user when `userId` is supplied (admin); otherwise act on self.
  const targetUserId = (typeof body.userId === 'string' && body.userId) || gate.userId
  const tz = readTzOffsetFromBody(body)

  await dbConnect()

  // ── Full reset: back to a brand-new account ────────────────────────────────
  if (body.reset) {
    const { set, unset } = resetUpdate()
    await MindProgress.findOneAndUpdate(
      { userId: targetUserId },
      { $set: set, $unset: unset },
      { upsert: true, setDefaultsOnInsert: true },
    )
    // Daily docs drive the streak and "already done today".
    await MindSession.deleteMany({ userId: targetUserId })
    return NextResponse.json({ ...(await snapshot(targetUserId, tz)), reset: true })
  }

  // ── Reset today's main session only — keep level, chapter and streak ───────
  // Two things gate the main session: the 20h cooldown (lastMainSessionAt) and
  // today's MindSession doc. Clearing one without the other leaves it locked.
  if (body.resetDailySession) {
    const dateKey = localDateKey(null, tz)
    await MindSession.deleteOne({ userId: targetUserId, dateKey })
    await MindProgress.updateOne(
      { userId: targetUserId },
      { $unset: { lastMainSessionAt: '' } },
    )
    return NextResponse.json({ ...(await snapshot(targetUserId, tz)), dailySessionReset: true })
  }

  // ── Set a value ────────────────────────────────────────────────────────────
  const set: Record<string, unknown> = {}

  const current = await MindProgress.findOne({ userId: targetUserId })
    .select('introducedSystems xp xpBank')
    .lean<{ introducedSystems?: string[]; xp?: number; xpBank?: number } | null>()

  if (typeof body.chapter === 'number') {
    Object.assign(set, chapterUpdate(body.chapter, current?.introducedSystems))
  }

  if (typeof body.level === 'number') {
    Object.assign(set, levelUpdate(body.level, current?.xp ?? 0, current?.xpBank ?? 0))
  }

  // An explicit XP value wins over the clamp levelUpdate applies.
  if (typeof body.xp === 'number') {
    set.xp = Math.max(0, Math.round(body.xp))
  }

  if (Object.keys(set).length === 0) {
    return NextResponse.json(
      { error: 'Provide chapter, level, xp, reset, or resetDailySession' },
      { status: 400 },
    )
  }

  await MindProgress.findOneAndUpdate(
    { userId: targetUserId },
    { $set: set },
    { upsert: true, setDefaultsOnInsert: true },
  )

  return NextResponse.json(await snapshot(targetUserId, tz))
}
