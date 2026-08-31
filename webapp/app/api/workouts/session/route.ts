import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { trackingBySlug, trackingFor, bellFieldsBySlug, bellFieldsFor } from '@/lib/workout/hydrateTracking'

// GET /api/workouts/session?id=<sessionId> — the full quick (kind:'quick') log
// for one session: exercises with their logged sets. Powers the calendar/history
// "summary" (what you did) and "continue" (rebuild + resume) actions.

interface RawSet { setNumber?: number; reps?: number | null; weight?: number | null; duration?: number | null; distance?: number | null; speed?: number | null; completed?: boolean }
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
  needsName?: boolean
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

    // What each exercise asks you to log — from the log itself, else the
    // catalog. Without it a resumed session came back untyped and unloggable.
    const bySlug = await trackingBySlug((log.exercises ?? []).map((ex) => ex.exerciseSlug))
    const bellBySlug = await bellFieldsBySlug((log.exercises ?? []).map((ex) => ex.exerciseSlug))

    return NextResponse.json({
      session: {
        sessionId: log.sessionId,
        title: log.title || 'Quick Session',
        needsName: log.needsName,
        focus: log.focus,
        date: new Date(log.date).toISOString(),
        completed: log.completed,
        duration: log.duration,
        exercises: (log.exercises ?? []).map((ex) => ({
          name: ex.name,
          exerciseSlug: ex.exerciseSlug || '',
          trackingType: trackingFor(ex, bySlug),
          ...bellFieldsFor(ex, bellBySlug),
          sets: (ex.sets ?? []).map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps ?? null,
            weight: s.weight ?? null,
            duration: s.duration ?? null,
            // Cardio is a distance and a speed, not a load. Leaving these out
            // meant a resumed treadmill session came back without them.
            distance: s.distance ?? null,
            speed: s.speed ?? null,
            completed: !!s.completed,
          })),
          // Grouping and the prescription come back too: this is what
          // "continue" rebuilds a session from, and a superset that is dropped
          // here comes back as two unrelated exercises.
          ...(ex.groupId ? { groupId: ex.groupId } : {}),
          ...(ex.groupType ? { groupType: ex.groupType } : {}),
          ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
          ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
          ...(ex.addedAdHoc ? { addedAdHoc: true } : {}),
          ...(ex.prescription ? { prescription: ex.prescription } : {}),
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching quick session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/workouts/session?id=<sessionId> — remove a quick session log.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await dbConnect()
    await UserProgress.updateOne(
      { userId: auth.userId },
      { $pull: { workoutLogs: { kind: 'quick', sessionId: id } } },
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting quick session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/workouts/session — manage a quick session. Body: { id, ... }
//   { id, date }            → re-date (date = YYYY-MM-DD or ISO): move to another day
//   { id, skipped: true }   → mark the planned session skipped
//   { id, skipped: false }  → un-skip (back to planned)
//   { id, title }           → rename without altering the recorded workout
//   { id, favorite: true }  → star the session for quick access from the list
//   { id, favorite: false } → unstar
// Fields can be sent together or separately.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => ({})) as {
      id?: string
      date?: string
      skipped?: boolean
      title?: unknown
      favorite?: boolean
    }
    const id = body.id
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (body.date === undefined && body.skipped === undefined && body.title === undefined && body.favorite === undefined) {
      return NextResponse.json({ error: 'date, skipped, title, or favorite is required' }, { status: 400 })
    }
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
      return NextResponse.json({ error: 'title must not be empty' }, { status: 400 })
    }

    const set: Record<string, unknown> = {}
    if (body.date !== undefined) {
      const raw = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? `${body.date}T12:00:00` : body.date
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'invalid date' }, { status: 400 })
      set['workoutLogs.$[elem].date'] = d
      set['workoutLogs.$[elem].startedAt'] = d
    }
    if (body.skipped !== undefined) {
      set['workoutLogs.$[elem].skipped'] = !!body.skipped
    }
    if (typeof body.title === 'string') {
      set['workoutLogs.$[elem].title'] = body.title.trim()
    }
    if (body.favorite !== undefined) {
      set['workoutLogs.$[elem].favorite'] = !!body.favorite
    }
    set.updatedAt = new Date()

    await dbConnect()
    const result = await UserProgress.updateOne(
      { userId: auth.userId, workoutLogs: { $elemMatch: { sessionId: id, kind: 'quick' } } },
      { $set: set },
      { arrayFilters: [{ 'elem.sessionId': id, 'elem.kind': 'quick' }] },
    )
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Quick session not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating quick session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
