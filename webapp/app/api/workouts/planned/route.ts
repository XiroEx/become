import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'

// GET /api/workouts/planned — upcoming PLANNED quick sessions: future-dated,
// incomplete, kind:'quick' workout logs. Returns each with a reconstructed
// DraftSession-shaped exercise list so the client can stash + start it (under
// the same sessionId, so finishing it consumes the plan).

interface RawSet { reps?: number | null; duration?: number | null; completed?: boolean }
interface RawEx {
  name: string
  exerciseSlug?: string
  sets?: RawSet[]
  groupId?: string
  groupType?: string
  groupLabel?: string
  groupRounds?: number
  addedAdHoc?: boolean
  prescription?: { sets?: number; reps?: string; duration?: string; rest?: string; trackingType?: string }
}
interface RawLog {
  kind?: string
  sessionId?: string
  title?: string
  focus?: string
  date: Date | string
  completed: boolean
  exercises?: RawEx[]
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    const up = await UserProgress.findOne({ userId: auth.userId })
      .select('workoutLogs')
      .lean<{ workoutLogs?: RawLog[] } | null>()

    const now = Date.now()
    const planned = (up?.workoutLogs ?? [])
      .filter((l) => l.kind === 'quick' && !l.completed && !!l.sessionId && new Date(l.date).getTime() > now)
      .map((l) => ({
        sessionId: l.sessionId,
        title: l.title || 'Planned session',
        focus: l.focus,
        date: new Date(l.date).toISOString(),
        exerciseCount: l.exercises?.length ?? 0,
        // DraftExercise-shaped so the client can stash + launch it.
        exercises: (l.exercises ?? []).map((ex) => {
          const first = ex.sets?.[0]
          // Time-based when a duration was recorded and no real rep count was —
          // the Track view writes `reps: 0` beside the duration, so checking
          // only for a null reps would call a 45-second plank a 0-rep set.
          const isTime = !!first && first.duration != null && !(first.reps && first.reps > 0)
          const p = ex.prescription
          return {
            exerciseSlug: ex.exerciseSlug || '',
            name: ex.name,
            trackingType: p?.trackingType || (isTime ? 'time' : 'reps'),
            sets: p?.sets ?? (ex.sets?.length || 1),
            reps: p?.reps ?? (!isTime && first?.reps != null ? String(first.reps) : ''),
            ...(p?.duration ? { duration: p.duration } : first?.duration != null ? { duration: String(first.duration) } : {}),
            ...(p?.rest ? { rest: p.rest } : {}),
            // Grouping survives the round trip, so a planned superset is still
            // a superset when the session is started.
            ...(ex.groupId ? { groupId: ex.groupId } : {}),
            ...(ex.groupType ? { groupType: ex.groupType } : {}),
            ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
            ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
          }
        }),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return NextResponse.json({ planned })
  } catch (error) {
    console.error('Error fetching planned sessions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
