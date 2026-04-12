import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import IdentityProfile from '@/models/IdentityProfile'
import DisciplineChallenge from '@/models/DisciplineChallenge'
import StateLog from '@/models/StateLog'
import Mission from '@/models/Mission'
import type { StartingPoint, PrimaryObstacle } from '@/models/IdentityProfile'

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
