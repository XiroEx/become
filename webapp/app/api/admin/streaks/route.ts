// Admin streak management.
//
//   GET  /api/admin/streaks?userId=&tz=      → the member's streaks (same numbers
//                                              they see) + every credit + the raw
//                                              overall counters
//   POST /api/admin/streaks  { userId, tz?, action, reason, ... }
//        action 'credit'      { pillars: ('workout'|'nutrition'|'mindset')[], from, to }
//                             marks each day in [from, to] as counting for each pillar
//        action 'uncredit'    { pillars?: [...], from, to }  removes credits in the range
//        action 'grant-super' { days }  credits all three pillars for the last N days, plus
//                             workout back to that week's Sunday so the weeks are on target
//        action 'set-overall' { streakDays?, longestStreak?, streakFreezes?, activeToday?: boolean }
//                             edits the stored day-streak counters directly
//
// Why this exists: when the app was down, or a coach wants to honour a streak
// a member kept in good faith, there was no way to do it short of editing the
// database. Every change here says who did it and why, and credits can be
// taken back. It also makes streak states reproducible for testing.

import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import dbConnect from '@/lib/mongodb'
import { requireAdmin } from '@/lib/adminAuth'
import UserProgress from '@/models/UserProgress'
import StreakCredit, { CREDIT_PILLARS, type CreditPillar } from '@/models/StreakCredit'
import { computeStreaks } from '@/lib/streaks/compute'
import { readTzOffset, readOptionalTzOffsetFromBody, localDateKey, utcMidnightDateKey } from '@/lib/dayWindow'
import { dayRange, STREAK_VISIBLE_MIN, shiftDay, weekdayOf } from '@/lib/streaks/pillars'
import { STREAK_MILESTONES, MAX_FREEZES } from '@/lib/streakConstants'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 92

function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && DAY_KEY.test(v)
}

async function snapshot(userId: string, tz: number) {
  const [streaks, creditDocs, progress] = await Promise.all([
    computeStreaks(userId, tz),
    StreakCredit.find({ userId: new Types.ObjectId(userId) }).sort({ dayKey: -1, createdAt: -1 }).limit(500).lean(),
    UserProgress.findOne({ userId }).select('streakDays longestStreak streakFreezes lastActivityDate milestonesReached').lean<Record<string, unknown> | null>(),
  ])
  return {
    streaks,
    credits: creditDocs.map(c => ({
      id: String(c._id),
      kind: c.kind,
      pillar: c.pillar ?? null,
      dayKey: c.dayKey,
      reason: c.reason ?? '',
      createdBy: c.createdBy ?? '',
      createdAt: c.createdAt ? new Date(c.createdAt as Date).toISOString() : null,
      meta: c.meta ?? null,
    })),
    overallRaw: {
      streakDays: (progress?.streakDays as number | undefined) ?? 0,
      longestStreak: (progress?.longestStreak as number | undefined) ?? 0,
      streakFreezes: (progress?.streakFreezes as number | undefined) ?? 0,
      lastActivityDate: progress?.lastActivityDate ? new Date(progress.lastActivityDate as Date).toISOString() : null,
      milestonesReached: (progress?.milestonesReached as number[] | undefined) ?? [],
    },
    constants: { minVisible: STREAK_VISIBLE_MIN, milestones: STREAK_MILESTONES, maxFreezes: MAX_FREEZES },
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId || !Types.ObjectId.isValid(userId)) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  try {
    await dbConnect()
    return NextResponse.json(await snapshot(userId, readTzOffset(request.nextUrl.searchParams)))
  } catch (error) {
    console.error('admin streaks GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const userId = typeof body.userId === 'string' ? body.userId : ''
  if (!Types.ObjectId.isValid(userId)) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  const tz = readOptionalTzOffsetFromBody(body) ?? 0
  const action = body.action
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
  const by = gate.email ?? gate.userId
  const uid = new Types.ObjectId(userId)

  try {
    await dbConnect()

    if (action === 'credit' || action === 'uncredit') {
      const pillars = Array.isArray(body.pillars)
        ? (body.pillars as unknown[]).filter((p): p is CreditPillar => CREDIT_PILLARS.includes(p as CreditPillar))
        : action === 'uncredit' ? [...CREDIT_PILLARS] : []
      if (pillars.length === 0) return NextResponse.json({ error: 'pillars required' }, { status: 400 })
      if (!isDayKey(body.from) || !isDayKey(body.to)) return NextResponse.json({ error: 'from/to must be YYYY-MM-DD' }, { status: 400 })
      const from = body.from <= body.to ? body.from : body.to
      const to = body.from <= body.to ? body.to : body.from
      const days = dayRange(from, to)
      if (days.length > MAX_RANGE_DAYS) return NextResponse.json({ error: `range too large (max ${MAX_RANGE_DAYS} days)` }, { status: 400 })

      if (action === 'credit') {
        if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })
        const ops = []
        for (const pillar of pillars) for (const dayKey of days) {
          ops.push({
            updateOne: {
              filter: { userId: uid, kind: 'credit', pillar, dayKey },
              update: { $setOnInsert: { userId: uid, kind: 'credit', pillar, dayKey, reason, createdBy: by, createdAt: new Date() } },
              upsert: true,
            },
          })
        }
        const res = await StreakCredit.bulkWrite(ops, { ordered: false })
        return NextResponse.json({ ok: true, credited: res.upsertedCount, ...(await snapshot(userId, tz)) })
      }
      const res = await StreakCredit.deleteMany({ userId: uid, kind: 'credit', pillar: { $in: pillars }, dayKey: { $gte: from, $lte: to } })
      return NextResponse.json({ ok: true, removed: res.deletedCount, ...(await snapshot(userId, tz)) })
    }

    if (action === 'grant-super') {
      // Credit nutrition + mindset + workout for the last N days, PLUS workout
      // back to the Sunday of the earliest touched week so those weeks hit
      // the target — otherwise a day landing in an already-lost week would not
      // count and "grant 3" could show 2.
      if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })
      const n = typeof body.days === 'number' && Number.isFinite(body.days) ? Math.max(1, Math.min(60, Math.round(body.days))) : 3
      const todayKey = localDateKey(null, tz)
      const startKey = shiftDay(todayKey, -(n - 1))
      const weekStart = shiftDay(startKey, -weekdayOf(startKey))
      const ops = []
      for (const dayKey of dayRange(startKey, todayKey)) for (const pillar of ['nutrition', 'mindset'] as CreditPillar[]) {
        ops.push({ updateOne: { filter: { userId: uid, kind: 'credit', pillar, dayKey }, update: { $setOnInsert: { userId: uid, kind: 'credit', pillar, dayKey, reason, createdBy: by, createdAt: new Date() } }, upsert: true } })
      }
      for (const dayKey of dayRange(weekStart, todayKey)) {
        ops.push({ updateOne: { filter: { userId: uid, kind: 'credit', pillar: 'workout', dayKey }, update: { $setOnInsert: { userId: uid, kind: 'credit', pillar: 'workout', dayKey, reason, createdBy: by, createdAt: new Date() } }, upsert: true } })
      }
      const res = await StreakCredit.bulkWrite(ops, { ordered: false })
      return NextResponse.json({ ok: true, credited: res.upsertedCount, ...(await snapshot(userId, tz)) })
    }

    if (action === 'set-overall') {
      if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 })
      const before = await UserProgress.findOne({ userId }).select('streakDays longestStreak streakFreezes lastActivityDate').lean<Record<string, unknown> | null>()
      const set: Record<string, unknown> = {}
      const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : undefined)
      const streakDays = num(body.streakDays, 10_000)
      const longestStreak = num(body.longestStreak, 10_000)
      const streakFreezes = num(body.streakFreezes, MAX_FREEZES)
      if (streakDays !== undefined) set.streakDays = streakDays
      if (longestStreak !== undefined) set.longestStreak = longestStreak
      if (streakFreezes !== undefined) set.streakFreezes = streakFreezes
      // Keep "best" honest: it can never sit below the current streak.
      const finalDays = streakDays ?? ((before?.streakDays as number | undefined) ?? 0)
      const finalBest = longestStreak ?? ((before?.longestStreak as number | undefined) ?? 0)
      if (finalBest < finalDays) set.longestStreak = finalDays
      if (body.activeToday === true) {
        // The engine stamps UTC-midnight day markers; do the same for today's LOCAL day.
        set.lastActivityDate = utcMidnightDateKey(localDateKey(null, tz))
      } else if (body.activeToday === false) {
        // "Not yet today": yesterday's marker, so the streak is alive but waiting.
        const y = new Date(utcMidnightDateKey(localDateKey(null, tz)).getTime() - 86_400_000)
        set.lastActivityDate = y
      }
      if (Object.keys(set).length === 0) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })
      await UserProgress.updateOne({ userId }, { $set: set }, { upsert: true })
      const after = await UserProgress.findOne({ userId }).select('streakDays longestStreak streakFreezes lastActivityDate').lean<Record<string, unknown> | null>()
      await StreakCredit.create({
        userId: uid, kind: 'overall', dayKey: localDateKey(null, tz), reason, createdBy: by,
        meta: {
          before: { streakDays: before?.streakDays ?? 0, longestStreak: before?.longestStreak ?? 0, streakFreezes: before?.streakFreezes ?? 0, lastActivityDate: before?.lastActivityDate ?? null },
          after: { streakDays: after?.streakDays ?? 0, longestStreak: after?.longestStreak ?? 0, streakFreezes: after?.streakFreezes ?? 0, lastActivityDate: after?.lastActivityDate ?? null },
        },
      })
      return NextResponse.json({ ok: true, ...(await snapshot(userId, tz)) })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('admin streaks POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
