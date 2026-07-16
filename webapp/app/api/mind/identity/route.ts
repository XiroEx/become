import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import IdentityProfile from '@/models/IdentityProfile'
import DisciplineChallenge from '@/models/DisciplineChallenge'
import StateLog from '@/models/StateLog'
import Mission from '@/models/Mission'
import type { StartingPoint, PrimaryObstacle } from '@/models/IdentityProfile'
import { readTzOffset, readTzOffsetFromBody, localDateKey } from '@/lib/dayWindow'

const DAY_MS = 86_400_000

// A streak is "alive" only if the last affirmation was today or yesterday;
// otherwise the day was missed and the display streak resets to 0 (mirrors the
// Discipline non-negotiables logic).
function affirmView(
  profile: { affirmStreak?: number; longestAffirmStreak?: number; lastAffirmedKey?: string | null },
  tz: number,
) {
  const today = localDateKey(null, tz)
  const yesterday = localDateKey(null, tz, new Date(Date.now() - DAY_MS))
  const alive = profile.lastAffirmedKey === today || profile.lastAffirmedKey === yesterday
  return {
    streak: alive ? (profile.affirmStreak ?? 0) : 0,
    longest: profile.longestAffirmStreak ?? 0,
    affirmedToday: profile.lastAffirmedKey === today,
  }
}

// Maps obstacle to the section that will move them fastest
const GUIDANCE: Record<PrimaryObstacle, { section: string; reason: string; startWith: string }> = {
  clarity: {
    section: 'mission',
    reason: 'You need a clear reason before anything else can stick.',
    startWith: 'Define your mission. Everything else builds on it.',
  },
  discipline: {
    section: 'discipline',
    reason: "Motivation is unreliable. Systems aren't.",
    startWith: 'Hit today\'s discipline challenge. One rep of keeping your word.',
  },
  motivation: {
    section: 'self-image',
    reason: "You don't need motivation. You need an identity to live up to.",
    startWith: 'Read your identity statement. Affirm it. Then move.',
  },
  environment: {
    section: 'social',
    reason: 'Your environment has more power over you than willpower ever will.',
    startWith: 'Understand what your current environment is doing to you — then change it.',
  },
}

const STARTING_LABELS: Record<StartingPoint, string> = {
  lost: 'Starting from zero',
  stuck: 'Breaking through',
  building: 'Building momentum',
  leveling_up: 'Leveling up',
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const profile = await IdentityProfile.findOne({ userId: auth.userId }).lean()

    if (!profile) return NextResponse.json({ profile: null })

    // Compute evolution score from real behavior
    const [challengesCompleted, statesLogged, missionSet] = await Promise.all([
      DisciplineChallenge.countDocuments({ userId: auth.userId, completed: true }),
      StateLog.countDocuments({ userId: auth.userId }),
      Mission.findOne({ userId: auth.userId }).lean(),
    ])

    const score = Math.min(
      100,
      (challengesCompleted * 3) +
      (statesLogged * 1) +
      (missionSet ? 15 : 0)
    )

    // Persist score so it's queryable over time (fire-and-forget, don't block response)
    IdentityProfile.updateOne({ userId: auth.userId }, { evolutionScore: score }).catch(() => {})

    const guidance = GUIDANCE[profile.primaryObstacle]
    const tz = readTzOffset(new URL(request.url).searchParams)

    return NextResponse.json({
      profile: { ...profile, evolutionScore: score },
      evolution: {
        score,
        challengesCompleted,
        statesLogged,
        hasMission: !!missionSet,
        startingLabel: STARTING_LABELS[profile.startingPoint],
      },
      guidance,
      affirm: affirmView(profile, tz),
    })
  } catch (err) {
    console.error('GET /api/mind/identity error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { currentSelf, futureSelf, primaryObstacle, startingPoint } = body as {
      currentSelf?: string
      futureSelf?: string
      primaryObstacle?: PrimaryObstacle
      startingPoint?: StartingPoint
    }

    const validObstacles: PrimaryObstacle[] = ['clarity', 'discipline', 'motivation', 'environment']
    const validPoints: StartingPoint[] = ['lost', 'stuck', 'building', 'leveling_up']

    if (!currentSelf || !futureSelf || !primaryObstacle || !startingPoint) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }
    if (!validObstacles.includes(primaryObstacle) || !validPoints.includes(startingPoint)) {
      return NextResponse.json({ error: 'Invalid values' }, { status: 400 })
    }

    await dbConnect()

    const profile = await IdentityProfile.findOneAndUpdate(
      { userId: auth.userId },
      { currentSelf, futureSelf, primaryObstacle, startingPoint, onboardingCompleted: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('PUT /api/mind/identity error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH { action: 'affirm', tz } — the daily affirmation of the future self.
// Idempotent per local day; advances the streak when yesterday was held, resets
// to 1 after a gap. Requires an existing profile (define your identity first).
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    if (body.action !== 'affirm' && body.action !== 'edit') {
      return NextResponse.json({ error: 'action must be "affirm" or "edit"' }, { status: 400 })
    }

    await dbConnect()
    const doc = await IdentityProfile.findOne({ userId: auth.userId })
    if (!doc) return NextResponse.json({ error: 'Define your identity first' }, { status: 404 })

    // Edit the current/future self without disturbing the obstacle/startingPoint
    // or the affirmation streak (lets the Self-Image pencil update just the text).
    if (body.action === 'edit') {
      const currentSelf = typeof body.currentSelf === 'string' ? body.currentSelf.trim().slice(0, 500) : ''
      const futureSelf = typeof body.futureSelf === 'string' ? body.futureSelf.trim().slice(0, 500) : ''
      if (!currentSelf || !futureSelf) {
        return NextResponse.json({ error: 'currentSelf and futureSelf are required' }, { status: 400 })
      }
      doc.currentSelf = currentSelf
      doc.futureSelf = futureSelf
      await doc.save()
      return NextResponse.json({ profile: { currentSelf: doc.currentSelf, futureSelf: doc.futureSelf } })
    }

    const tz = readTzOffsetFromBody(body)
    const today = localDateKey(null, tz)
    const yesterday = localDateKey(null, tz, new Date(Date.now() - DAY_MS))
    if (doc.lastAffirmedKey !== today) {
      doc.affirmStreak = doc.lastAffirmedKey === yesterday ? (doc.affirmStreak ?? 0) + 1 : 1
      doc.lastAffirmedKey = today
      doc.longestAffirmStreak = Math.max(doc.longestAffirmStreak ?? 0, doc.affirmStreak)
      await doc.save()
    }
    return NextResponse.json({
      affirm: { streak: doc.affirmStreak, longest: doc.longestAffirmStreak, affirmedToday: true },
    })
  } catch (err) {
    console.error('PATCH /api/mind/identity error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
