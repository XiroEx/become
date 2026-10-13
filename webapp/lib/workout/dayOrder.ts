// Which workout comes after this one.
//
// This lived in `app/api/programs/current-workout/route.ts` as an exported
// helper, and three other routes imported it from there. An App Router
// `route.ts` may only export the HTTP handlers and a short list of config
// fields, so that export was a latent build error: `next build` type-checks
// every route against that shape and rejects the module with
//
//   "calculateNextDay" is not a valid Route export field.
//
// It surfaced while the program-exercise work was being done and had nothing
// to do with it — the check is sensitive to when the route's module graph is
// resolved, so the same code can pass one build and fail the next. Moving the
// helper here settles it: the route keeps its handlers, the three callers
// import a module that is allowed to export things, and `npm run build`
// stops depending on evaluation order.

export interface ProgramWorkout {
  day: string
  title: string
  exercises: Array<{
    exerciseSlug?: string
    name?: string
    type?: string
    sets?: number
    reps?: string
    rest?: string
    details?: string
  }>
}

export interface ProgramPhase {
  phase: string
  weeks: string
  focus: string
  workouts: ProgramWorkout[] | Record<string, Omit<ProgramWorkout, 'day'>>
}

/** Normalize workouts from the legacy object format to an array. */
export function normalizeWorkouts(
  workouts: ProgramWorkout[] | Record<string, Omit<ProgramWorkout, 'day'>> | undefined | null,
): ProgramWorkout[] {
  if (!workouts) {
    return []
  }
  if (Array.isArray(workouts)) {
    return workouts
  }
  // Convert object format { "Day 1": {...}, "Day 2": {...} } to array format
  return Object.entries(workouts).map(([day, workout]) => ({
    day,
    ...workout,
  }))
}

/** The next workout day (and phase) after `currentDay` in `currentPhase`. */
export function calculateNextDay(
  currentDay: string,
  currentPhase: number,
  phases: ProgramPhase[],
): { nextDay: string; nextPhase: number } {
  if (!phases || phases.length === 0) {
    return { nextDay: 'Day 1', nextPhase: 1 }
  }

  const phaseIdx = Math.max(0, currentPhase - 1)
  const phase = phases[phaseIdx]

  if (!phase?.workouts) {
    return { nextDay: 'Day 1', nextPhase: 1 }
  }

  const workouts = normalizeWorkouts(phase.workouts)
  const currentDayIdx = workouts.findIndex(w => w.day === currentDay)

  if (currentDayIdx === -1) {
    // Current day not found, start at Day 1
    return { nextDay: workouts[0]?.day || 'Day 1', nextPhase: currentPhase }
  }

  const nextDayIdx = currentDayIdx + 1

  if (nextDayIdx >= workouts.length) {
    // End of phase - check if there's another phase
    const nextPhaseIdx = phaseIdx + 1
    if (nextPhaseIdx < phases.length) {
      const nextPhase = phases[nextPhaseIdx]
      const nextPhaseWorkouts = normalizeWorkouts(nextPhase.workouts)
      return {
        nextDay: nextPhaseWorkouts[0]?.day || 'Day 1',
        nextPhase: nextPhaseIdx + 1,
      }
    }
    // Restart from beginning of current phase (program repeating)
    return { nextDay: workouts[0]?.day || 'Day 1', nextPhase: currentPhase }
  }

  return { nextDay: workouts[nextDayIdx].day, nextPhase: currentPhase }
}
