import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import Schedule from '@/models/Schedule'

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    await dbConnect()

    // Get user progress with active programs
    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()

    if (!userProgress || !userProgress.activePrograms || userProgress.activePrograms.length === 0) {
      return NextResponse.json({ activePrograms: [] })
    }

    // Auto-cleanup: remove activePrograms entries for programs that no longer exist
    const activeProgramIds = userProgress.activePrograms.map((p: { programId: string }) => p.programId)
    const existingPrograms = await ProgramModel.find(
      { program_id: { $in: activeProgramIds } },
      { program_id: 1 }
    ).lean()
    const existingIds = new Set(existingPrograms.map((p: { program_id: string }) => p.program_id))
    const orphanedIds = activeProgramIds.filter((id: string) => !existingIds.has(id))

    if (orphanedIds.length > 0) {
      // Fire-and-forget cleanup of orphaned entries and their logs
      UserProgress.updateOne(
        { userId: payload.userId },
        {
          $pull: {
            activePrograms: { programId: { $in: orphanedIds } },
            workoutLogs: { programId: { $in: orphanedIds } },
          }
        }
      ).catch(() => {})
    }

    // Filter to in-progress, active, paused, or completed programs (not orphaned).
    // We include 'completed' here so we can self-heal programs that were incorrectly auto-completed.
    const inProgressPrograms = userProgress.activePrograms.filter(
      (p: { programId: string; status: string }) =>
        existingIds.has(p.programId) &&
        (p.status === 'in-progress' || p.status === 'active' || p.status === 'paused' || p.status === 'completed')
    )

    // Load schedule documents to derive accurate counts from status fields + dayLabel for log reconciliation
    const candidateIds = inProgressPrograms.map((p: { programId: string }) => p.programId)
    const schedules = await Schedule.find(
      { userId: payload.userId, programId: { $in: candidateIds } },
      { programId: 1, 'scheduledWorkouts.status': 1, 'scheduledWorkouts.dayLabel': 1, 'scheduledWorkouts.date': 1 }
    ).lean<{ programId: string; scheduledWorkouts: { status: string; dayLabel: string; date: Date }[] }[]>()
    const scheduleMap = new Map(schedules.map((s) => [s.programId, s]))

    // Workout logs for cross-referencing historical completions (sessions done before schedule-sync fix
    // may still show status='scheduled' in the DB even though they were completed via workout logs)
    type WorkoutLog = { programId: string; day: string; completed: boolean }
    const workoutLogs = (userProgress.workoutLogs || []) as WorkoutLog[]

    type CandidateProgram = {
      programId: string
      programName: string
      startDate: Date
      currentPhase: number
      currentDay: string
      completedWorkouts: number
      totalWorkouts: number
      status: string
      lastWorkoutDate?: Date
    }

    // Return active programs with progress info derived from schedule (source of truth).
    // Self-heal any 'completed' programs that still have remaining scheduled sessions.
    const activePrograms = (inProgressPrograms as CandidateProgram[]).flatMap((program) => {
      let completedWorkouts = program.completedWorkouts
      let totalWorkouts = program.totalWorkouts
      let effectiveStatus = program.status

      const schedule = scheduleMap.get(program.programId)
      if (schedule?.scheduledWorkouts?.length) {
        // All non-rest sessions (skipped still counts toward total — it's a planned session not done)
        const sessions = schedule.scheduledWorkouts.filter((w) => w.status !== 'rest')
        totalWorkouts = sessions.length

        // Completed = schedule says completed OR matched by a workout log.
        // Uses greedy chronological matching to handle repeating dayLabels
        // (e.g. "Day 1" appears 5× in a 5-week program — one log entry of "Day 1"
        // should only count as one completion, not five).
        const availableLogs = new Map<string, number>()
        for (const log of workoutLogs) {
          if (log.programId === program.programId && log.completed) {
            availableLogs.set(log.day, (availableLogs.get(log.day) || 0) + 1)
          }
        }
        completedWorkouts = [...sessions]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .filter((w) => {
            if (w.status === 'completed') {
              // Consume the matching log so a future scheduled occurrence of the same dayLabel
              // doesn't get counted a second time (double-count bug).
              const n = availableLogs.get(w.dayLabel) || 0
              if (n > 0) availableLogs.set(w.dayLabel, n - 1)
              return true
            }
            if (w.status === 'skipped') return false
            const n = availableLogs.get(w.dayLabel) || 0
            if (n > 0) { availableLogs.set(w.dayLabel, n - 1); return true }
            return false
          }).length

        // Self-heal: program was incorrectly auto-completed but schedule has remaining sessions
        const remaining = totalWorkouts - completedWorkouts
        if (program.status === 'completed' && remaining > 0) {
          UserProgress.updateOne(
            { userId: payload.userId, 'activePrograms.programId': program.programId },
            { $set: { 'activePrograms.$.status': 'in-progress' } }
          ).catch(() => {})
          effectiveStatus = 'in-progress'
        }

        // Forward self-heal: every session is resolved (completed or firmly
        // skipped) with nothing left to do → the program is complete. Only fires
        // at the dead-end, since any remaining scheduled/missed session is
        // unresolved and keeps completed+skipped below the total.
        const skippedCount = sessions.filter((w) => w.status === 'skipped').length
        if (effectiveStatus !== 'completed' && totalWorkouts > 0 && completedWorkouts + skippedCount >= totalWorkouts) {
          UserProgress.updateOne(
            { userId: payload.userId, 'activePrograms.programId': program.programId },
            { $set: { 'activePrograms.$.status': 'completed' } }
          ).catch(() => {})
          effectiveStatus = 'completed'
        }
      }

      // Exclude truly completed programs from this endpoint's response
      if (effectiveStatus === 'completed') return []

      return [{
        programId: program.programId,
        programName: program.programName,
        startDate: program.startDate,
        currentPhase: program.currentPhase,
        currentDay: program.currentDay,
        completedWorkouts,
        totalWorkouts,
        progress: totalWorkouts > 0
          ? Math.round((completedWorkouts / totalWorkouts) * 100)
          : 0,
        status: effectiveStatus,
        lastWorkoutDate: program.lastWorkoutDate,
      }]
    })

    return NextResponse.json({ activePrograms })

  } catch (error) {
    console.error('Error fetching active programs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
