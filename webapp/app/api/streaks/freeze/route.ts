// POST /api/streaks/freeze — spend the one super-streak freeze on today.
//
// The super streak is strict on purpose, and it is lost silently at midnight.
// This is the single deliberate exception: one freeze, covering one day, earned
// back a month later. It cannot rewrite yesterday, cannot be spent on a day that
// is already complete, and cannot be spent when there is no streak to protect —
// the rules live in lib/streaks/freeze and are tested there.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { readTzOffset, localDateKey } from '@/lib/dayWindow'
import { computeStreaks } from '@/lib/streaks/compute'
import { checkFreeze, FREEZE_REFUSAL_MESSAGE } from '@/lib/streaks/freeze'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()

    const body = await request.json().catch(() => ({})) as { tz?: number }
    const tz = typeof body.tz === 'number' ? body.tz : readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tz)

    const before = await computeStreaks(auth.userId, tz)
    const sup = before.pillars.super

    const verdict = checkFreeze({
      dayKey: todayKey,
      todayKey,
      usedDays: sup.freeze.usedDays,
      currentStreak: sup.current,
      completeToday: sup.activeToday,
    })
    if (!verdict.ok) {
      return NextResponse.json(
        { error: FREEZE_REFUSAL_MESSAGE[verdict.reason], reason: verdict.reason, streaks: before },
        { status: 409 },
      )
    }

    await UserProgress.updateOne(
      { userId: auth.userId },
      { $addToSet: { superFreezeDays: todayKey }, $set: { updatedAt: new Date() } },
      { upsert: true },
    )

    // Recompute so the caller gets the streak as it stands WITH the freeze
    // applied — the number it was about to lose, held.
    const after = await computeStreaks(auth.userId, tz)
    return NextResponse.json({ frozen: todayKey, streaks: after })
  } catch (error) {
    console.error('Error spending super-streak freeze:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
