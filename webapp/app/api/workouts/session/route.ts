import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'

// GET /api/workouts/session?id=<sessionId> — the full quick (kind:'quick') log
// for one session: exercises with their logged sets. Powers the calendar/history
// "summary" (what you did) and "continue" (rebuild + resume) actions.

interface RawSet { setNumber?: number; reps?: number | null; weight?: number | null; duration?: number | null; distance?: number | null; speed?: number | null; completed?: boolean }
interface RawEx { name: string; exerciseSlug?: string; sets?: RawSet[] }
interface RawLog {
  kind?: string
  sessionId?: string
  title?: string
  focus?: string
  date: Date | string
  completed: boolean
  duration?: number
  exercises?: RawEx[]
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    }
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await dbConnect()
    const up = await UserProgress.findOne({ userId: auth.userId })
      .select('workoutLogs')
      .lean<{ workoutLogs?: RawLog[] } | null>()

    const log = (up?.workoutLogs ?? []).find((l) => l.kind === 'quick' && l.sessionId === id)
    if (!log) return NextResponse.json({ session: null }, { status: 404 })

    return NextResponse.json({
      session: {
        sessionId: log.sessionId,
        title: log.title || 'Quick Session',
        focus: log.focus,
        date: new Date(log.date).toISOString(),
        completed: log.completed,
        duration: log.duration,
        exercises: (log.exercises ?? []).map((ex) => ({
          name: ex.name,
          exerciseSlug: ex.exerciseSlug || '',
          sets: (ex.sets ?? []).map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps ?? null,
            weight: s.weight ?? null,
            duration: s.duration ?? null,
            completed: !!s.completed,
          })),
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching quick session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
