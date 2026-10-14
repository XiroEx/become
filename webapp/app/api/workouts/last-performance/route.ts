// ---------------------------------------------------------------------------
// GET /api/workouts/last-performance?slugs=slug1,slug2,...
//
// Returns the most recent completed set per requested exercise for the
// authenticated user, so the live-workout UI can prefill reps / weight /
// speed / duration / distance from "last time you did this." Values are
// the LAST COMPLETED set from the most recent workout log that contains
// the exercise (matched by exerciseSlug, falling back to swap-tracked
// originalExerciseSlug, falling back to name normalization).
//
// Response shape:
//   { performances: { [slug]: { reps?, weight?, bells?, speed?, duration?,
//                                distance?, date, programId? } | null } }
//
// `bells` (1 | 2) is the member's one-dumbbell-or-two choice from that set —
// read by the Live and Track views to default their one/two control to what
// they did last time. Absent means the automatic per-exercise answer.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { formatPRsForLiveWorkout, type IExercisePR } from '@/lib/exercisePRs'
import { readBellCount } from '@/lib/workout/bellCount'

interface PerformanceEntry {
  reps?: number
  weight?: number
  /**
   * One dumbbell or two, as the member answered it on that set. This is how
   * the choice is remembered for next time — the Live and Track views default
   * their one/two control to it, with no preferences collection anywhere.
   * Absent (legacy sets, and anything that is not dumbbell/kettlebell work)
   * means the automatic per-exercise answer, same as it has always meant.
   */
  bells?: 1 | 2
  speed?: number
  duration?: number
  distance?: number
  date: string
  programId?: string
}

interface LeanSet {
  reps?: number
  weight?: number
  bells?: 1 | 2
  speed?: number
  duration?: number
  distance?: number
  completed?: boolean
}

interface LeanExercise {
  name?: string
  exerciseSlug?: string
  originalExerciseSlug?: string
  sets?: LeanSet[]
}

interface LeanWorkoutLog {
  date: Date
  programId?: string
  exercises?: LeanExercise[]
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const slugsRaw = searchParams.get('slugs') ?? ''
    const slugs = Array.from(
      new Set(
        slugsRaw
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),
    )

    if (slugs.length === 0) {
      return NextResponse.json({ performances: {} })
    }

    await dbConnect()

    // We only need the workoutLogs to compute this. lean() skips Mongoose
    // doc instantiation overhead.
    const progress = await UserProgress.findOne({ userId: auth.userId })
      .select('workoutLogs exercisePRs')
      .lean<{ workoutLogs?: LeanWorkoutLog[] } | null>()

    const logs = progress?.workoutLogs ?? []
    // Sort by date desc so the first match per slug is the most recent.
    const sortedLogs = [...logs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )

    const performances: Record<string, PerformanceEntry | null> = {}
    for (const slug of slugs) performances[slug] = null

    const remaining = new Set(slugs)
    for (const log of sortedLogs) {
      if (remaining.size === 0) break
      const exs = log.exercises ?? []
      for (const ex of exs) {
        if (remaining.size === 0) break
        // Match against exerciseSlug AND originalExerciseSlug (swap-tracked
        // history still counts as "last time you did the original lift").
        const candidates = [
          ex.exerciseSlug?.toLowerCase(),
          ex.originalExerciseSlug?.toLowerCase(),
          ex.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        ].filter((s): s is string => Boolean(s))

        for (const candidate of candidates) {
          if (!remaining.has(candidate)) continue
          // Find the LAST completed set on this exercise. We pick the last
          // completed (not just the last) so half-finished sessions don't
          // bleed in as "previous performance."
          const sets = ex.sets ?? []
          for (let i = sets.length - 1; i >= 0; i--) {
            const s = sets[i]
            if (!s.completed) continue
            // One dumbbell or two, as they answered it on that set. Only ever
            // 1 or 2 — anything else reads as absent, i.e. "use the automatic
            // answer" (lib/workout/bellCount.ts).
            const bells = readBellCount(s.bells)
            performances[candidate] = {
              reps: s.reps,
              weight: s.weight,
              ...(bells && { bells }),
              speed: s.speed,
              duration: s.duration,
              distance: s.distance,
              date: new Date(log.date).toISOString(),
              programId: log.programId,
            }
            remaining.delete(candidate)
            break
          }
        }
      }
    }

    // Personal records travel with the same request. A quick session has no
    // program to hang a history call off, so without these it could never say
    // "last session" or "beat your PR" — real lifting that the app pretended
    // not to recognise.
    const prs = formatPRsForLiveWorkout(
      (progress as unknown as { exercisePRs?: IExercisePR[] } | null)?.exercisePRs,
    )

    return NextResponse.json({ performances, prs })
  } catch (err) {
    console.error('Error fetching last-performance:', err)
    return NextResponse.json({ error: 'Failed to fetch last performance' }, { status: 500 })
  }
}
