import type { IScheduledWorkout } from '@/models/Schedule'

export interface PhaseData {
  phase: string
  weeks: string
  focus: string
  workouts: WorkoutData[] | Record<string, Omit<WorkoutData, 'day'>>
}

export interface WorkoutData {
  day: string
  title: string
  exercises: unknown[]
}

export function normalizeWorkouts(workouts: WorkoutData[] | Record<string, Omit<WorkoutData, 'day'>> | undefined | null): WorkoutData[] {
  if (!workouts) return []
  if (Array.isArray(workouts)) return workouts
  return Object.entries(workouts).map(([day, workout]) => ({ day, ...workout }))
}

/** Parse phase weeks string like "1-4" to get number of weeks the split repeats */
export function parsePhaseWeeks(weeksStr: string): number {
  const match = weeksStr.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (match) return parseInt(match[2]) - parseInt(match[1]) + 1
  const single = weeksStr.match(/^(\d+)$/)
  if (single) return 1
  return 1
}

/** Collect all workouts across all phases, repeating each phase's split for its duration */
export function collectAllWorkouts(phases: PhaseData[]): { phase: number; dayLabel: string; title: string }[] {
  const allWorkouts: { phase: number; dayLabel: string; title: string }[] = []
  for (let i = 0; i < phases.length; i++) {
    const workouts = normalizeWorkouts(phases[i].workouts)
    const numWeeks = parsePhaseWeeks(phases[i].weeks || '1')
    for (let week = 0; week < numWeeks; week++) {
      for (const w of workouts) {
        allWorkouts.push({ phase: i + 1, dayLabel: w.day, title: w.title })
      }
    }
  }
  return allWorkouts
}

/** Generate scheduled workouts from program phases mapped to calendar dates */
export function generateScheduledWorkouts(
  phases: PhaseData[],
  trainingDays: number[],
  startDate: Date,
  programId: string
): Array<Omit<IScheduledWorkout, 'completedAt' | 'notes'>> {
  const allWorkouts = collectAllWorkouts(phases)
  if (allWorkouts.length === 0 || trainingDays.length === 0) return []

  const sortedDays = [...trainingDays].sort((a, b) => a - b)
  const scheduled: Array<Omit<IScheduledWorkout, 'completedAt' | 'notes'>> = []

  const current = new Date(startDate)
  current.setUTCHours(0, 0, 0, 0)
  let workoutIndex = 0

  const maxDate = new Date(current)
  maxDate.setFullYear(maxDate.getFullYear() + 1)

  while (workoutIndex < allWorkouts.length && current < maxDate) {
    const dayOfWeek = current.getUTCDay()
    if (sortedDays.includes(dayOfWeek)) {
      const workout = allWorkouts[workoutIndex]
      scheduled.push({
        date: new Date(current),
        programId,
        phase: workout.phase,
        dayLabel: workout.dayLabel,
        workoutTitle: workout.title,
        status: 'scheduled',
      })
      workoutIndex++
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return scheduled
}

/**
 * Regenerate a schedule preserving past workouts and rebuilding future ones.
 * Returns { pastWorkouts, futureWorkouts, allWorkouts } for the caller to save.
 */
export function regenerateSchedule(
  existingWorkouts: IScheduledWorkout[],
  phases: PhaseData[],
  trainingDays: number[],
  effectiveStartDate: Date,
  programId: string
): {
  pastWorkouts: IScheduledWorkout[]
  futureWorkouts: Array<Omit<IScheduledWorkout, 'completedAt' | 'notes'>>
  allWorkouts: IScheduledWorkout[]
} {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)

  // Preserve completed/missed/skipped workouts in the past
  const pastWorkouts = existingWorkouts.filter((w) => {
    const d = new Date(w.date)
    d.setUTCHours(0, 0, 0, 0)
    return d < now && (w.status === 'completed' || w.status === 'missed' || w.status === 'skipped')
  })

  // Count completed occurrences per phase+dayLabel
  const completedCounts = new Map<string, number>()
  for (const w of pastWorkouts) {
    if (w.status === 'completed') {
      const key = `${w.phase}-${w.dayLabel}`
      completedCounts.set(key, (completedCounts.get(key) || 0) + 1)
    }
  }

  // Collect remaining workouts, subtracting already-completed ones
  const remainingWorkouts: { phase: number; dayLabel: string; title: string }[] = []
  const usedCounts = new Map<string, number>()
  for (let i = 0; i < phases.length; i++) {
    const workouts = normalizeWorkouts(phases[i].workouts)
    const numWeeks = parsePhaseWeeks(phases[i].weeks || '1')
    for (let week = 0; week < numWeeks; week++) {
      for (const w of workouts) {
        const key = `${i + 1}-${w.day}`
        const used = usedCounts.get(key) || 0
        const completed = completedCounts.get(key) || 0
        if (used < completed) {
          usedCounts.set(key, used + 1)
        } else {
          remainingWorkouts.push({ phase: i + 1, dayLabel: w.day, title: w.title })
        }
      }
    }
  }

  // Generate dates for remaining workouts
  const sortedDays = [...trainingDays].sort((a, b) => a - b)
  const effectiveStart = new Date(effectiveStartDate)
  effectiveStart.setUTCHours(0, 0, 0, 0)

  const futureWorkouts: Array<Omit<IScheduledWorkout, 'completedAt' | 'notes'>> = []
  const current = new Date(effectiveStart)
  let widx = 0

  const maxDate = new Date(current)
  maxDate.setFullYear(maxDate.getFullYear() + 1)

  while (widx < remainingWorkouts.length && current < maxDate) {
    if (sortedDays.includes(current.getUTCDay())) {
      const w = remainingWorkouts[widx]
      futureWorkouts.push({
        date: new Date(current),
        programId,
        phase: w.phase,
        dayLabel: w.dayLabel,
        workoutTitle: w.title,
        status: 'scheduled',
      })
      widx++
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return {
    pastWorkouts,
    futureWorkouts,
    allWorkouts: [...pastWorkouts, ...futureWorkouts] as IScheduledWorkout[],
  }
}

/**
 * Catch-up reflow for a "stuck" schedule.
 *
 * A program still in progress can run out of upcoming slots when the user falls
 * behind: every remaining dated slot lapses into the past, so the calendar looks
 * "finished" even though the dashboard/hub (which track completion, not dates)
 * still say "continue". This re-offers the outstanding work on upcoming training
 * days so every surface agrees.
 *
 * Skips are respected as firm decisions: COMPLETED and SKIPPED slots are both kept
 * as immutable history and are NOT re-offered. Only genuinely-unresolved sessions
 * (fell-behind / missed — never done, never deliberately skipped) are re-scheduled
 * onto upcoming training days from `fromDate`. This keeps a deliberate skip from
 * being resurrected in a jumbled order, and keeps the total session count equal to
 * the program length (no double-counting).
 *
 * Returns the new full slot array, or null when there's nothing to reflow — i.e.
 * every session is already completed or skipped (the program is effectively done),
 * or no training days are configured. A null return signals the caller that the
 * program is resolved and should be marked complete rather than left "in progress".
 */
export function reflowStuckSchedule(
  existingWorkouts: IScheduledWorkout[],
  phases: PhaseData[],
  trainingDays: number[],
  fromDate: Date,
  programId: string
): IScheduledWorkout[] | null {
  const sortedDays = [...trainingDays].sort((a, b) => a - b)
  if (sortedDays.length === 0) return null

  // Completed + skipped are history — preserve them (dates, status, completedAt)
  // untouched. A skip is a firm "not doing this session", so it is never re-offered.
  const resolvedPast = existingWorkouts.filter(
    (w) => w.status === 'completed' || w.status === 'skipped'
  )

  // Remaining = every program workout minus the ones already resolved (done or skipped).
  const resolvedCounts = new Map<string, number>()
  for (const w of resolvedPast) {
    const key = `${w.phase}-${w.dayLabel}`
    resolvedCounts.set(key, (resolvedCounts.get(key) || 0) + 1)
  }
  const remaining: { phase: number; dayLabel: string; title: string }[] = []
  const usedCounts = new Map<string, number>()
  for (let i = 0; i < phases.length; i++) {
    const workouts = normalizeWorkouts(phases[i].workouts)
    const numWeeks = parsePhaseWeeks(phases[i].weeks || '1')
    for (let week = 0; week < numWeeks; week++) {
      for (const w of workouts) {
        const key = `${i + 1}-${w.day}`
        const used = usedCounts.get(key) || 0
        const resolved = resolvedCounts.get(key) || 0
        if (used < resolved) usedCounts.set(key, used + 1)
        else remaining.push({ phase: i + 1, dayLabel: w.day, title: w.title })
      }
    }
  }
  if (remaining.length === 0) return null

  // Lay the remaining workouts on upcoming training days from fromDate.
  const future: Array<Omit<IScheduledWorkout, 'completedAt' | 'notes'>> = []
  const current = new Date(fromDate)
  current.setUTCHours(0, 0, 0, 0)
  const maxDate = new Date(current)
  maxDate.setFullYear(maxDate.getFullYear() + 1)
  let widx = 0
  while (widx < remaining.length && current < maxDate) {
    if (sortedDays.includes(current.getUTCDay())) {
      const w = remaining[widx]
      future.push({
        date: new Date(current),
        programId,
        phase: w.phase,
        dayLabel: w.dayLabel,
        workoutTitle: w.title,
        status: 'scheduled',
      })
      widx++
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return [...resolvedPast, ...future] as IScheduledWorkout[]
}
