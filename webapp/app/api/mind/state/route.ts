import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import StateLog, { MindState } from '@/models/StateLog'
import MindProgress from '@/models/MindProgress'

// What we say back the moment someone names their state.
//
// This used to be ONE fixed sentence per state, so the same 22 words came back on
// every single check-in ("This is the state champions live in. Don't waste it —
// get to your workout or your most important task."). Two things were wrong with
// that: it never changed, and it was a ROUTING line telling you to go do
// something else, shown on the opening screen of the session you just started.
//
// Now each state has a pool that rotates per check-in, and every line is voiced
// for the moment it actually appears: acknowledge where they are and hand off to
// the session, rather than sending them away from it.
const REVEALS: Record<MindState, string[]> = {
  stressed: [
    'Naming it is the first move. We bring the system down a notch before anything else.',
    "Pressure is real and it is loud. We are not solving it yet, we are just taking the edge off.",
    'You do not have to fix this right now. Settle first, decide second.',
    'Stress is energy without a direction. Let us give it one.',
  ],
  distracted: [
    'Scatter is normal. We pull it back to one point.',
    'Too many open loops. Everything but one can wait an hour.',
    'Your attention is spread thin, and that is fixable in about three minutes.',
    'We are not chasing focus. We are choosing one thing.',
  ],
  low_energy: [
    'Low is data, not destiny. Small input, real output.',
    'You showed up flat and came anyway. That already counts.',
    'We are not forcing big today. We are finding the one small thing.',
    'Heavy days still count. Let us keep this one light.',
  ],
  locked_in: [
    'This is the state everything gets built in. Let us spend it on purpose.',
    'You came in dialed. We are not wasting it, we are aiming it.',
    'Rare fuel. Let us put it somewhere that matters.',
    'Locked in is the easy part. Aiming it is the work.',
  ],
}

// Twenty feelings collapse onto four states, so "Grateful" and "Locked in" used
// to get a byte-identical reply. These answer the FEELING they actually tapped.
// Anything without an entry falls through to its state pool above.
const FEELING_REVEALS: Record<string, string> = {
  Grateful: 'Gratitude is the one that compounds quietly. Hold it a second before we move.',
  Energized: 'Energy is cheap to waste and hard to manufacture. Let us point it somewhere.',
  Motivated: 'Motivation is real but it is not a plan. We turn it into one thing today.',
  Calm: 'Calm is not the absence of pressure, it is you handling it. Good place to work from.',
  'Locked in': 'This is the state everything gets built in. Let us spend it on purpose.',
  Tired: 'Tired is honest. We keep today small and still make it count.',
  Drained: 'Empty tank. Today is maintenance, and maintenance still counts.',
  Unmotivated: 'Waiting to feel like it is how weeks disappear. One small move breaks that.',
  Down: 'Some days sit heavy for no clean reason. You still showed up.',
  'Low energy': 'Low is data, not destiny. Small input, real output.',
  Scattered: 'Scatter is normal. We pull it back to one point.',
  Restless: 'Restless is energy without a lane. Let us give it one.',
  Foggy: 'Fog lifts once something concrete gets done. We will find the something.',
  Bored: 'Bored usually means under-challenged, not out of options.',
  Distracted: 'Too many open loops. Everything but one can wait an hour.',
  Anxious: 'Anxiety runs ahead of the facts. We will slow it to walking pace.',
  Overwhelmed: 'Too much at once. Nothing moves until the pile gets smaller.',
  Frustrated: 'Frustration means you care about the outcome. Let us aim it.',
  Angry: 'Anger is fuel with bad steering. We will take the wheel back.',
  Stressed: 'Naming it is the first move. We bring the system down a notch.',
}

/** Rotate per check-in so nobody sees the same reveal twice in a row. Keyed on
 *  how many times this user has logged THIS state, so it advances every time.
 *  A recognised feeling always wins — answering the word they picked is the
 *  difference between being read and being bucketed. */
function revealFor(state: MindState, priorCount: number, feeling?: string): string {
  if (feeling && FEELING_REVEALS[feeling]) return FEELING_REVEALS[feeling]
  const pool = REVEALS[state]
  return pool[Math.abs(priorCount) % pool.length]
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const limitParam = Number(new URL(request.url).searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(100, Math.floor(limitParam)) : 7

    const logs = await StateLog.find({ userId: auth.userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()

    return NextResponse.json({ logs })
  } catch (err) {
    console.error('GET /api/mind/state error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { state, note, previousState, feeling } = body as {
      state: MindState; note?: string; previousState?: MindState; feeling?: string
    }

    const valid: MindState[] = ['stressed', 'distracted', 'low_energy', 'locked_in']
    if (!valid.includes(state)) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }

    await dbConnect()

    // How many times they've logged THIS state before — drives the reveal
    // rotation. Best-effort: a failure here just starts the rotation at 0.
    const priorCount = await StateLog.countDocuments({ userId: auth.userId, state }).catch(() => 0)

    const log = await StateLog.create({
      userId: auth.userId,
      state,
      ...(typeof note === 'string' && note.trim() && { note: note.trim().slice(0, 500) }),
      ...(valid.includes(previousState as MindState) && { previousState }),
      ...(typeof feeling === 'string' && feeling.trim() && { feeling: feeling.trim().slice(0, 40) }),
    })

    // Grant XP — fire and forget
    MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      { $inc: { xp: 10 } },
      { upsert: true, setDefaultsOnInsert: true }
    ).catch(() => {})

    return NextResponse.json({
      log,
      recommendation: { message: revealFor(state, priorCount, typeof feeling === 'string' ? feeling.trim() : undefined) },
    })
  } catch (err) {
    console.error('POST /api/mind/state error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
