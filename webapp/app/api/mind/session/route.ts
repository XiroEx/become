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
import UserProgress from '@/models/UserProgress'
import MealLog from '@/models/MealLog'
import { staleReason, type ActiveSessionStamp } from '@/lib/mind/activeSession'
import { readTzOffset, readTzOffsetFromBody, localDateKey } from '@/lib/dayWindow'
import {
  getLevelProgress, chapterFromSessions, sessionsIntoChapter,
  mainSessionAvailable, MAIN_SESSION_COOLDOWN_MS, CHAPTERS, getUnlockedSystems,
} from '@/lib/mindXP'
import {
  loadUserEntitlement, featureAccess, entitlementsEnforced, gateResponse,
  FREE_LIMITS,
} from '@/lib/entitlements'
import { peekQuota } from '@/lib/entitlementGuards'

// Free tier gets main sessions 1-10; session 11 is locked. The count is the
// EXISTING milestone MindProgress.completedMainSessions, so nothing new is
// written and the check is naturally idempotent. 10 is also
// SESSIONS_PER_CHAPTER, so the wall lands exactly on the Chapter 1 → Chapter 2
// boundary — the same moment Vision would unlock.
//
// It counts COMPLETED sessions, never mainSessionCount: that one is chapter
// progress and carries the intake / self-declare / admin head start, which put
// a brand-new free member at 10/10 before their first session. See
// lib/allowances.ts#MILESTONE_COUNTS.
const MIND_FREE_SESSIONS = FREE_LIMITS['mind-sessions'].limit

/**
 * Has this member run out of free Mind sessions? Returns the 403 to send, or
 * null to continue. Cheap enough to run on both the PUT (session start) and the
 * POST (completion): blocking only at the payoff would walk someone through a
 * whole session before refusing it.
 *
 * Goes through peekQuota so the milestone count, the admin/plus bypass and the
 * 403 body are defined in exactly one place — a second hand-rolled copy is how
 * this gate came to read a different number from the one
 * GET /api/me/entitlements reports.
 */
async function mindSessionGate(userId: string): Promise<NextResponse | null> {
  // Switch check first: with enforcement off this costs nothing at all, which
  // is what makes shipping it dark free.
  if (!entitlementsEnforced()) return null
  const { allowed, gate } = await peekQuota(userId, 'mind-sessions')
  return allowed || !gate ? null : gateResponse(gate)
}

// A completed MAIN session grants this much LEVEL XP (level is uncapped, fed by
// main + arsenal). Main sessions are gated to one per 20h and each counts toward
// the chapter (10 per chapter). If someone somehow completes again inside the
// cooldown (UI hides it), it still nudges level but does NOT count/advance.
const MAIN_SESSION_XP = 20
const IN_COOLDOWN_XP = 5

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

/** Watermarks the active session is judged against. */
async function activityNow(userId: string) {
  const [progress, meal] = await Promise.all([
    UserProgress.findOne({ userId }).select('workoutLogs.date').lean<{ workoutLogs?: { date: Date }[] } | null>(),
    MealLog.findOne({ user: userId }).sort({ loggedAt: -1 }).select('loggedAt').lean<{ loggedAt?: Date } | null>(),
  ])
  const workouts = (progress?.workoutLogs ?? [])
    .map(w => new Date(w.date).getTime())
    .filter(t => Number.isFinite(t))
  return {
    lastWorkoutAt: workouts.length ? new Date(Math.max(...workouts)) : null,
    lastMealAt: meal?.loggedAt ? new Date(meal.loggedAt) : null,
  }
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

    // Plan state, so the hub can draw the lock BEFORE Begin rather than letting
    // the member start a session the POST will refuse. Always reported (the
    // fields are just null/false when unenforced or uncapped) so the client has
    // one shape to read, and the entitlement is not even loaded while the
    // switch is off.
    let mindCapped = false
    if (entitlementsEnforced()) {
      const ent = await loadUserEntitlement(auth.userId!)
      mindCapped = featureAccess(ent.role, ent.tier, 'mind-sessions') !== 'full'
    }
    // Recency for session spacing (breath cooldown + modality variety) + the 20h
    // main-session cooldown that decides whether the hub shows the main session
    // or Training Grounds.
    const prog = await MindProgress.findOne({ userId: auth.userId })
      .select('lastBreathAt recentKinds lastMainSessionAt activeSession completedMainSessions')
      .lean<{
        lastBreathAt?: Date
        recentKinds?: string[]
        lastMainSessionAt?: Date
        completedMainSessions?: number
        activeSession?: ActiveSessionStamp & { seed: number; plan: unknown }
      } | null>()

    // The meter the hub draws, and the same number the gate decides on. Clamped
    // to the limit for the same reason GET /api/me/entitlements clamps it: this
    // is rendered as used/limit, and a long-time member is legitimately past it.
    const sessionsUsed = Math.min(prog?.completedMainSessions ?? 0, MIND_FREE_SESSIONS)
    const mindLocked = mindCapped && sessionsUsed >= MIND_FREE_SESSIONS

    // Hand back the unfinished session rather than composing a new one, unless
    // the day rolled over or the member logged something it was built from.
    const stored = prog?.activeSession
    const stale = stored ? staleReason(stored, dateKey, await activityNow(auth.userId!)) : null
    if (stored && stale) {
      // Drop it now so the next Begin composes cleanly instead of racing this.
      await MindProgress.updateOne({ userId: auth.userId }, { $unset: { activeSession: 1 } }).catch(() => {})
    }
    const resume = stored && !stale ? { seed: stored.seed, plan: stored.plan } : null

    const available = mainSessionAvailable(prog?.lastMainSessionAt)
    const nextMainSessionAt = prog?.lastMainSessionAt
      ? new Date(prog.lastMainSessionAt).getTime() + MAIN_SESSION_COOLDOWN_MS
      : null

    return NextResponse.json({
      dateKey,
      completedToday: !!doc,
      streak,
      lastBreathAt: prog?.lastBreathAt ? new Date(prog.lastBreathAt).getTime() : null,
      recentKinds: prog?.recentKinds ?? [],
      // 20h main-session cooldown
      mainSessionAvailable: available,
      lastMainSessionAt: prog?.lastMainSessionAt ? new Date(prog.lastMainSessionAt).getTime() : null,
      nextMainSessionAt: available ? null : nextMainSessionAt,
      // Non-null when there is a session in progress to pick up where it left off.
      resume,
      resumeDropped: stale ?? null,
      // Plan lock. Orthogonal to mainSessionAvailable (the 20h cooldown):
      // `locked` never lifts on its own, the cooldown always does.
      locked: mindLocked,
      lockReason: mindLocked ? ('tier' as const) : null,
      requiresTier: mindLocked ? ('plus' as const) : null,
      sessionsUsed,
      sessionsLimit: mindCapped ? MIND_FREE_SESSIONS : null,
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

    const locked = await mindSessionGate(auth.userId!)
    if (locked) return locked

    const now = Date.now()

    // Read progress BEFORE the write so we can detect the 20h cooldown, the
    // level-up crossing, and the chapter advance.
    const before = await MindProgress.findOne({ userId: auth.userId })
      .select('levelXp mainSessionCount completedMainSessions lastMainSessionAt chapter xpBank chapterHistory')
      .lean<{ levelXp?: number; mainSessionCount?: number; completedMainSessions?: number; lastMainSessionAt?: Date; chapter?: number; xpBank?: number } | null>()

    const prevLevelXp = before?.levelXp ?? 0
    const prevCount = before?.mainSessionCount ?? 0
    const prevChapter = before?.chapter ?? 1
    // A "counted" main session only lands once every 20h. Inside the cooldown
    // (the UI hides the main session then, so this is a defensive path) it still
    // nudges level a little but does NOT count toward chapters.
    const counted = mainSessionAvailable(before?.lastMainSessionAt, now)
    const grantXp = counted ? MAIN_SESSION_XP : IN_COOLDOWN_XP

    // Keep the per-day session doc for the streak. Also stamps completions/moves.
    const doc = await MindSession.findOneAndUpdate(
      { userId: auth.userId, dateKey },
      {
        $inc: { completions: 1, ...(counted ? { xpAwarded: grantXp } : {}) },
        $setOnInsert: { userId: auth.userId, dateKey },
        $set: { moves, completedAt: new Date() },
      },
      { upsert: true, new: true },
    )
    const completions = doc?.completions ?? 1

    // Recency for session spacing (breath cooldown + modality variety). `moves`
    // are the EFFECTIVE kinds the player actually showed (post state-swap).
    const kinds = moves.map((m) => m.kind)
    const recencySet: Record<string, unknown> = { recentKinds: kinds.filter((k) => k !== 'state-check') }
    if (kinds.includes('breath')) recencySet.lastBreathAt = new Date()

    // Grant LEVEL xp (and bank toward the Becoming score). A counted main session
    // also increments the chapter-gating session count + stamps the cooldown.
    const inc: Record<string, number> = { levelXp: grantXp, xpBank: grantXp }
    // TWO counters, deliberately. mainSessionCount is chapter progress and may
    // legitimately be seeded from a chapter head start; completedMainSessions is
    // the count of sessions that actually happened, and is the ONLY one the
    // free-tier allowance reads. This line is the only thing that increments it.
    if (counted) inc.mainSessionCount = 1
    if (counted) inc.completedMainSessions = 1
    if (counted) recencySet.lastMainSessionAt = new Date(now)

    const newCount = counted ? prevCount + 1 : prevCount
    const derivedChapter = chapterFromSessions(newCount)
    const chapterAdvanced = counted && derivedChapter > prevChapter
    // Never report a chapter below the stored one (guards the rare case where a
    // POST beats the progress-GET seed of mainSessionCount).
    const newChapter = Math.max(prevChapter, derivedChapter)
    if (chapterAdvanced) {
      recencySet.chapter = newChapter
      recencySet.lastGrowthAt = new Date(now)
    }

    const update: Record<string, unknown> = { $inc: inc, $set: recencySet }
    if (chapterAdvanced) {
      update.$push = { chapterHistory: { chapter: newChapter, unlockedAt: new Date(now) } }
    }
    // The session is finished, so the stored copy has done its job. Leaving it
    // would hand the same completed session back at the next Begin.
    const updateWithClear = {
      ...update,
      $unset: { ...(update as { $unset?: Record<string, 1> }).$unset, activeSession: 1 as const },
    }

    await MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      updateWithClear,
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => {})

    const newLevelXp = prevLevelXp + grantXp
    const levelBefore = getLevelProgress(prevLevelXp)
    const levelNow = getLevelProgress(newLevelXp)
    const leveledUp = levelNow.level > levelBefore.level
    const streak = await streakFor(auth.userId!, dateKey)
    const nextMainSessionAt = counted
      ? now + MAIN_SESSION_COOLDOWN_MS
      : new Date(before?.lastMainSessionAt ?? now).getTime() + MAIN_SESSION_COOLDOWN_MS

    return NextResponse.json({
      completions,
      counted,
      trainingMode: !counted,
      xpAwarded: grantXp,
      // Level (per-user, XP-driven, uncapped)
      levelXp: newLevelXp,
      level: levelNow.level,
      previousLevel: levelBefore.level,
      leveledUp,
      levelProgress: levelNow,
      // Chapter (gated by main-session count)
      chapter: newChapter,
      previousChapter: prevChapter,
      chapterAdvanced,
      newlyUnlocked: chapterAdvanced ? CHAPTERS[newChapter - 1].systems : [],
      unlockedSystems: getUnlockedSystems(newChapter),
      currentChapter: CHAPTERS[newChapter - 1],
      mainSessionCount: newCount,
      sessionsIntoChapter: sessionsIntoChapter(newCount),
      // Cooldown
      nextMainSessionAt,
      xpBank: (before?.xpBank ?? 0) + grantXp,
      streak,
      // Feature unlock moments crossed by THIS session (coach after 3 main
      // sessions, The Becoming after 5) — surfaced on the payoff.
      featureUnlocks: [
        ...(counted && newCount === 3 ? ['coach'] : []),
        // The Becoming is open to everyone now (it led the dashboard from
        // 2026-08-18); nothing to unlock at session 5 any more.
      ],
    })
  } catch (err) {
    console.error('POST /api/mind/session error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}


/**
 * PUT: remember the session that was just composed, so leaving mid-way and
 * coming back returns the SAME session. Cleared by POST on completion, by a new
 * local day, or by a workout/meal log that changes what it was built from.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const seed = Number(body?.seed)
    const plan = body?.plan
    if (!Number.isFinite(seed) || !plan || typeof plan !== 'object') {
      return NextResponse.json({ error: 'seed and plan are required' }, { status: 400 })
    }

    await dbConnect()

    // Gate the START, not just the completion — this PUT is the first write of
    // a composed session (MindJourney), so refusing here is what stops a locked
    // member being walked through a whole session for nothing.
    const locked = await mindSessionGate(auth.userId)
    if (locked) return locked

    const dateKey = localDateKey(null, readTzOffsetFromBody(body))
    const now = await activityNow(auth.userId)

    await MindProgress.updateOne(
      { userId: auth.userId },
      {
        $set: {
          activeSession: {
            dateKey,
            seed,
            plan,
            generatedAt: new Date(),
            lastWorkoutAt: now.lastWorkoutAt,
            lastMealAt: now.lastMealAt,
          },
        },
      },
      { upsert: true },
    )

    return NextResponse.json({ ok: true, dateKey })
  } catch (err) {
    console.error('PUT /api/mind/session error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
