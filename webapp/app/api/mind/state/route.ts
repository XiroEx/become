import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import StateLog, { MindState } from '@/models/StateLog'
import MindProgress from '@/models/MindProgress'

const RECOMMENDATIONS: Record<MindState, { action: string; tab: string; message: string }> = {
  stressed: {
    action: 'Breathe First',
    tab: 'state-shift',
    message: 'Stress is just energy without direction. A 4-7-8 breath cycle will reset your nervous system in under 2 minutes.',
  },
  distracted: {
    action: 'Lock In',
    tab: 'state-shift',
    message: "Your attention is scattered — that's fixable. Use Focus Mode to anchor yourself and get one thing done.",
  },
  low_energy: {
    action: 'Remember Why',
    tab: 'mission',
    message: "Low energy is often a signal you've drifted from your purpose. Read your mission and reconnect.",
  },
  locked_in: {
    action: 'Execute',
    tab: 'home',
    message: "This is the state champions live in. Don't waste it — get to your workout or your most important task.",
  },
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const logs = await StateLog.find({ userId: auth.userId })
      .sort({ timestamp: -1 })
      .limit(7)
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
    const { state, note, previousState } = body as { state: MindState; note?: string; previousState?: MindState }

    const valid: MindState[] = ['stressed', 'distracted', 'low_energy', 'locked_in']
    if (!valid.includes(state)) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
    }

    await dbConnect()

    const log = await StateLog.create({
      userId: auth.userId,
      state,
      ...(typeof note === 'string' && note.trim() && { note: note.trim().slice(0, 500) }),
      ...(valid.includes(previousState as MindState) && { previousState }),
    })

    // Grant XP — fire and forget
    MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      { $inc: { xp: 10 } },
      { upsert: true, setDefaultsOnInsert: true }
    ).catch(() => {})

    return NextResponse.json({ log, recommendation: RECOMMENDATIONS[state] })
  } catch (err) {
    console.error('POST /api/mind/state error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
