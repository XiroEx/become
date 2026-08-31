import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { trackingBySlug, trackingFor, bellFieldsBySlug, bellFieldsFor } from '@/lib/workout/hydrateTracking'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import type { IWorkoutLog } from '@/models/UserProgress'
import { computeExercisePRsFromLogs } from '@/lib/exercisePRs'
import { normalizeWorkoutLogCorrection } from '@/lib/workoutLogCorrections'
import { bustTilesCache } from '@/lib/redis'

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
  favorite?: boolean
  date: Date
  duration?: number
  exercises?: Array<{
    exerciseSlug?: string
    name?: string
    sets?: Array<{ completed?: boolean; reps?: number; weight?: number; duration?: number; distance?: number; speed?: number }>
    groupId?: string
    groupType?: string
    groupLabel?: string
    groupRounds?: number
    addedAdHoc?: boolean
    prescription?: { sets?: number; reps?: string; duration?: string; rest?: string; trackingType?: string }
  }>
}

// PATCH /api/workouts/logs — correct measurements in one completed log.
// The locator is ownership-scoped by the authenticated UserProgress document:
// quick logs use their stable sessionId; program logs use their immutable
// program/day/date tuple. Exercise identity and count stay fixed so this path
// cannot silently turn a correction into a different workout.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      locator?: { kind?: unknown; sessionId?: unknown; programId?: unknown; day?: unknown; date?: unknown }
      correction?: unknown
    } | null
    const locator = body?.locator
    if (!locator || (locator.kind !== 'quick' && locator.kind !== 'program')) {
      return NextResponse.json({ error: 'A valid workout locator is required' }, { status: 400 })
    }

    let locatorDate = Number.NaN
    if (locator.kind === 'quick') {
      if (typeof locator.sessionId !== 'string' || !locator.sessionId.trim()) {
        if (typeof locator.date !== 'string') {
          return NextResponse.json({ error: 'sessionId or date is required for a quick session' }, { status: 400 })
        }
        locatorDate = new Date(locator.date).getTime()
        if (!Number.isFinite(locatorDate)) {
          return NextResponse.json({ error: 'Workout date is invalid' }, { status: 400 })
        }
      }
    } else {
      if (
        typeof locator.programId !== 'string' || !locator.programId.trim() ||
        typeof locator.day !== 'string' || !locator.day.trim() ||
        typeof locator.date !== 'string'
      ) {
        return NextResponse.json({ error: 'programId, day, and date are required for a program workout' }, { status: 400 })
      }
      locatorDate = new Date(locator.date).getTime()
      if (!Number.isFinite(locatorDate)) {
        return NextResponse.json({ error: 'Workout date is invalid' }, { status: 400 })
      }
    }

    const normalized = normalizeWorkoutLogCorrection(body?.correction)
    if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 })

    await dbConnect()
    const progress = await UserProgress.findOne({ userId: auth.userId })
    if (!progress) return NextResponse.json({ error: 'Workout log not found' }, { status: 404 })

    const logIndex = progress.workoutLogs.findIndex((log: IWorkoutLog) => {
      if (locator.kind === 'quick') {
        return (log.kind === 'quick' || !log.programId) && (
          typeof locator.sessionId === 'string' && locator.sessionId.trim()
            ? log.sessionId === locator.sessionId
            : new Date(log.date).getTime() === locatorDate
        )
      }
      return (
        log.kind !== 'quick' &&
        log.programId === locator.programId &&
        log.day === locator.day &&
        new Date(log.date).getTime() === locatorDate
      )
    })
    if (logIndex < 0) return NextResponse.json({ error: 'Workout log not found' }, { status: 404 })

    const log = progress.workoutLogs[logIndex]
    if (!log.completed) {
      return NextResponse.json({ error: 'Only completed workout logs can be corrected here' }, { status: 409 })
    }
    if (log.exercises.length !== normalized.value.exercises.length) {
      return NextResponse.json({ error: 'Exercise count cannot be changed from the correction editor' }, { status: 400 })
    }

    for (let index = 0; index < log.exercises.length; index += 1) {
      const existing = log.exercises[index]
      const correction = normalized.value.exercises[index]
      if (
        existing.exerciseSlug && correction.exerciseSlug &&
        existing.exerciseSlug !== correction.exerciseSlug
      ) {
        return NextResponse.json({ error: `Exercise ${index + 1} does not match the saved workout` }, { status: 400 })
      }
      if (!existing.exerciseSlug && existing.name.trim() !== correction.name) {
        return NextResponse.json({ error: `Exercise ${index + 1} does not match the saved workout` }, { status: 400 })
      }
      existing.sets = correction.sets
    }

    if (normalized.value.duration !== undefined) log.duration = normalized.value.duration
    if (normalized.value.notes !== undefined) log.notes = normalized.value.notes || undefined
    if (normalized.value.title !== undefined) {
      if (locator.kind !== 'quick') {
        return NextResponse.json({ error: 'Only quick-session titles can be changed' }, { status: 400 })
      }
      log.title = normalized.value.title
      log.needsName = false
    }

    // A correction may lower the set that used to be a record. Incremental PR
    // updates cannot remove stale maxima, so replay every completed log before
    // saving this one UserProgress document.
    progress.exercisePRs = computeExercisePRsFromLogs(progress.workoutLogs)
    progress.markModified('workoutLogs')
    progress.markModified('exercisePRs')
    await progress.save()
    await bustTilesCache(auth.userId!.toString())

    return NextResponse.json({ success: true, recalculatedPRs: progress.exercisePRs.length })
  } catch (error) {
    console.error('Error correcting workout log:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
      .select('workoutLogs activePrograms favoriteSessionOrder')
      .lean<{
        workoutLogs?: RawLog[]
        activePrograms?: Array<{ programId: string; programName: string }>
        favoriteSessionOrder?: string[]
      } | null>()

    const programNames = new Map<string, string>()
    for (const p of userProgress?.activePrograms ?? []) {
      programNames.set(p.programId, p.programName)
    }

    // Only the reopen path needs this: what each exercise asks you to log, so a
    // session reopened from history comes back with its weight column intact.
    const trackingMap = withExercises
      ? await trackingBySlug(
          (userProgress?.workoutLogs ?? [])
            .filter((l) => l.kind === 'quick' || !l.programId)
            .flatMap((l) => (l.exercises ?? []).map((ex) => ex.exerciseSlug)),
        )
      : {}
    const bellMap = withExercises
      ? await bellFieldsBySlug(
          (userProgress?.workoutLogs ?? [])
            .filter((l) => l.kind === 'quick' || !l.programId)
            .flatMap((l) => (l.exercises ?? []).map((ex) => ex.exerciseSlug)),
        )
      : {}

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
                  trackingType: trackingFor(ex, trackingMap),
                  ...bellFieldsFor(ex, bellMap),
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
          favorite: !!log.favorite,
          date: new Date(log.date).toISOString(),
          duration: log.duration,
          exerciseCount,
          completedSets,
          ...(draftExercises ? { exercises: draftExercises } : {}),
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // Manual drag order for favorited quick sessions in the Sessions list.
    // History/Calendar/etc. ignore this field and keep the date-desc sort
    // above; only the Sessions tab re-groups favorites to the top with it.
    return NextResponse.json({ logs, favoriteSessionOrder: userProgress?.favoriteSessionOrder ?? [] })
  } catch (error) {
    console.error('Error fetching workout logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
