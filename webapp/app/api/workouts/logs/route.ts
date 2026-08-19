import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'

// GET /api/workouts/logs
//   ?programId=xxx  — all logs for ONE program (builds the completedDays set on
//                     the program detail page). Original behavior, unchanged.
//   (no programId)  — the full session HISTORY across program + quick sessions,
//                     newest first, enriched with kind/title/program name and an
//                     exercise count. By default returns completed sessions only;
//                     pass ?includeIncomplete=true to include in-progress ones.
//   ?withExercises=true — also return each quick session's exercises, so a saved
//                     session can be REOPENED rather than regenerated. Opt-in:
//                     most callers only need the counts, and this multiplies the
//                     payload for a member with a long history.
type RawLog = {
  programId?: string
  day?: string
  phase?: number
  kind?: 'program' | 'quick'
  title?: string
  focus?: string
  sessionId?: string
  completed: boolean
  skipped?: boolean
  date: Date
  duration?: number
  exercises?: Array<{
    exerciseSlug?: string
    name?: string
    sets?: Array<{ completed?: boolean; reps?: number; duration?: number }>
    groupId?: string
    groupType?: string
    groupLabel?: string
    groupRounds?: number
    addedAdHoc?: boolean
    prescription?: { sets?: number; reps?: string; duration?: string; rest?: string; trackingType?: string }
  }>
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')

    await dbConnect()

    // ── Single-program mode (original contract) ──────────────────────────────
    if (programId) {
      const userProgress = await UserProgress.findOne({ userId: payload.userId })
        .select('workoutLogs')
        .lean<{ workoutLogs?: RawLog[] } | null>()

      const logs = (userProgress?.workoutLogs ?? [])
        .filter((log) => log.programId === programId)
        .map((log) => ({
          day: log.day,
          phase: log.phase,
          completed: log.completed,
          date: new Date(log.date).toISOString(),
          duration: log.duration,
        }))

      return NextResponse.json({ logs })
    }

    // ── History mode (all sessions) ──────────────────────────────────────────
    const includeIncomplete = searchParams.get('includeIncomplete') === 'true'
    const withExercises = searchParams.get('withExercises') === 'true'

    const userProgress = await UserProgress.findOne({ userId: payload.userId })
      .select('workoutLogs activePrograms')
      .lean<{
        workoutLogs?: RawLog[]
        activePrograms?: Array<{ programId: string; programName: string }>
      } | null>()

    const programNames = new Map<string, string>()
    for (const p of userProgress?.activePrograms ?? []) {
      programNames.set(p.programId, p.programName)
    }

    const logs = (userProgress?.workoutLogs ?? [])
      .filter((log) => includeIncomplete || log.completed)
      .map((log) => {
        const kind: 'program' | 'quick' = log.kind === 'quick' || !log.programId ? 'quick' : 'program'
        const exerciseCount = log.exercises?.length ?? 0
        const completedSets =
          log.exercises?.reduce(
            (n, ex) => n + (ex.sets?.filter((s) => s.completed).length ?? 0),
            0,
          ) ?? 0
        const programName = log.programId ? programNames.get(log.programId) : undefined
        const title =
          log.title ||
          (kind === 'program'
            ? [programName, log.day].filter(Boolean).join(' · ') || log.day || 'Workout'
            : 'Quick Session')
        // The saved exercises, DraftExercise-shaped, so tapping a session can
        // REOPEN it. Without these the hub had nothing to open and instead
        // regenerated a brand-new session from the focus tag — which is why a
        // saved session opened as an unrelated (and different every time) one.
        // Only quick sessions need this; program days are resolved from the
        // program itself.
        const draftExercises =
          withExercises && kind === 'quick'
            ? (log.exercises ?? []).map((ex) => {
                const first = ex.sets?.[0]
                // Time-based when a duration was recorded and no real rep count
                // was. The rep count matters: the Track view writes `reps: 0`
                // next to the duration, so "reps == null" alone would call a
                // 45-second plank a 0-rep strength set.
                const isTime = !!first && first.duration != null && !(first.reps && first.reps > 0)
                const p = ex.prescription
                return {
                  exerciseSlug: ex.exerciseSlug || '',
                  // Every save writes a name; the fallback only guards a
                  // hand-edited log so the row can't render blank.
                  name: ex.name || 'Exercise',
                  trackingType: p?.trackingType ?? (isTime ? ('time' as const) : ('reps' as const)),
                  sets: p?.sets ?? (ex.sets?.length || 1),
                  reps: p?.reps ?? (!isTime && first?.reps != null ? String(first.reps) : ''),
                  ...(p?.duration ? { duration: p.duration } : first?.duration != null ? { duration: String(first.duration) } : {}),
                  ...(p?.rest ? { rest: p.rest } : {}),
                  // Reopening a session has to bring its supersets with it.
                  ...(ex.groupId ? { groupId: ex.groupId } : {}),
                  ...(ex.groupType ? { groupType: ex.groupType } : {}),
                  ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
                  ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
                  ...(ex.addedAdHoc ? { addedAdHoc: true } : {}),
                }
              })
            : undefined

        return {
          kind,
          title,
          focus: log.focus,
          programId: log.programId,
          programName,
          day: log.day,
          phase: log.phase,
          sessionId: log.sessionId,
          completed: log.completed,
          skipped: !!log.skipped,
          date: new Date(log.date).toISOString(),
          duration: log.duration,
          exerciseCount,
          completedSets,
          ...(draftExercises ? { exercises: draftExercises } : {}),
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error fetching workout logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
