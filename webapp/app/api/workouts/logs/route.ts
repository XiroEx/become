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
  exercises?: Array<{ sets?: Array<{ completed?: boolean }> }>
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
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error fetching workout logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
