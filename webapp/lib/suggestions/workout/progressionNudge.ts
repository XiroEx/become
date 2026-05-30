// Progression-nudge suggestion source (double-progression rule).
//
// Double progression: once the user hits the TOP of an exercise's prescribed
// rep range on their working set with full quality (all reps completed, and
// RPE ≤ 8 when logged), the next step is to add the smallest sensible load:
//   - barbell / fixed-bar lifts → +5 lb total
//   - dumbbells                 → +2.5 lb PER hand
// then reset to the bottom of the rep range and climb again.
//
// This is the precise, per-exercise evaluator. It needs the last session's
// actual sets, the exercise's equipment, and the prescribed rep range — none
// of which live in the coarse RecentActivity bundle the existing
// activity-level nudge uses. So it's exposed as a `WorkoutSuggestionSource`
// (id / title / eligible / render) backed by an injectable session loader,
// and registered into the engine under its own registry key. When the engine
// has no per-set data to give it (today's dashboard), the default loader
// returns null and the source stays silent — it never double-fires with the
// coarse nudge.

import { registerSource, listSources } from '../registry'
import type { Suggestion, SuggestionSourceFn } from '../types'

// ── Public types ────────────────────────────────────────────────────────────

export interface ProgressionSetLog {
  weight: number
  reps: number
  completed: boolean
  /** Rate of perceived exertion 1–10, if the user logged it. */
  rpe?: number | null
}

export interface LastSessionData {
  exerciseSlug: string
  exerciseName: string
  /** Exercise.equipment — drives the load increment. */
  equipment: string[]
  /** Prescribed rep range for the working set. Null when unknown. */
  repRange: { min: number; max: number } | null
  /** The last session's sets for this exercise. */
  sets: ProgressionSetLog[]
  date: Date
}

export interface ProgressionNudgeResult {
  exerciseSlug: string
  exerciseName: string
  /** Heaviest completed working weight last session. */
  topWeight: number
  /** Reps achieved on the working set. */
  reps: number
  /** Load to add: 5 (barbell) or 2.5 (dumbbell, per hand). */
  incrementLbs: number
  /** True for dumbbells — the increment is per hand. */
  perSide: boolean
  /** topWeight + incrementLbs. */
  suggestedWeight: number
  repRangeMax: number
}

export type LoadLastSession = (
  userId: string,
  exerciseSlug: string,
) => Promise<LastSessionData | null>

// ── Increment rule ──────────────────────────────────────────────────────────

const RPE_QUALITY_CEILING = 8

/**
 * Smallest sensible load jump for the exercise's equipment. Dumbbells go up
 * 2.5 lb per hand; everything else (barbell, EZ/trap bar, machines) +5 lb.
 */
export function progressionIncrement(
  equipment: string[],
): { incrementLbs: number; perSide: boolean } {
  const eq = (equipment || []).map(e => e.toLowerCase())
  const isDumbbell = eq.includes('dumbbell')
  const isBarbell =
    eq.includes('barbell') || eq.includes('ez_bar') || eq.includes('trap_bar') ||
    eq.includes('safety_squat_bar')
  if (isDumbbell && !isBarbell) return { incrementLbs: 2.5, perSide: true }
  return { incrementLbs: 5, perSide: false }
}

// ── Pure evaluator ──────────────────────────────────────────────────────────

/**
 * Apply the double-progression rule to one session. Returns a nudge result
 * when the working set hit the top of the rep range with full quality;
 * otherwise null.
 *
 * Working set = the heaviest completed set (weight tie-break → most reps).
 * Quality = that set is completed AND, if RPE was logged, RPE ≤ 8.
 * Top-of-range = working set reps ≥ repRange.max.
 */
export function evaluateProgressionNudge(
  data: LastSessionData,
): ProgressionNudgeResult | null {
  if (!data.repRange) return null
  const { max } = data.repRange

  // Pick the heaviest completed set; tie-break on reps.
  let working: ProgressionSetLog | null = null
  for (const s of data.sets || []) {
    if (s.completed !== true) continue
    if (!(s.weight > 0) || !(s.reps > 0)) continue
    if (
      !working ||
      s.weight > working.weight ||
      (s.weight === working.weight && s.reps > working.reps)
    ) {
      working = s
    }
  }
  if (!working) return null

  // Full quality: RPE (if logged) must be ≤ ceiling.
  if (typeof working.rpe === 'number' && working.rpe > RPE_QUALITY_CEILING) {
    return null
  }

  // Must have hit the TOP of the prescribed range.
  if (working.reps < max) return null

  const { incrementLbs, perSide } = progressionIncrement(data.equipment)
  return {
    exerciseSlug: data.exerciseSlug,
    exerciseName: data.exerciseName,
    topWeight: working.weight,
    reps: working.reps,
    incrementLbs,
    perSide,
    suggestedWeight: working.weight + incrementLbs,
    repRangeMax: max,
  }
}

// ── Suggestion shaping ──────────────────────────────────────────────────────

export function nudgeToSuggestion(r: ProgressionNudgeResult): Suggestion {
  const perSideNote = r.perSide ? ' per hand' : ''
  return {
    id: `workout.progression-nudge.${r.exerciseSlug}`,
    severity: 'nudge',
    title: `Add weight to ${r.exerciseName}`,
    body:
      `Last ${r.exerciseName} session you hit ${r.reps} reps at ${r.topWeight} lb — ` +
      `the top of your range. Try ${r.suggestedWeight} lb${perSideNote} next time and ` +
      `build the reps back up.`,
    primaryAction: {
      label: 'Open progress',
      href: `/dashboard/progress/${encodeURIComponent(r.exerciseSlug)}`,
    },
    dismissible: true,
    cooldownDays: 4,
    source: 'workout',
    sourceData: {
      exerciseSlug: r.exerciseSlug,
      topWeight: r.topWeight,
      reps: r.reps,
      incrementLbs: r.incrementLbs,
      perSide: r.perSide,
      suggestedWeight: r.suggestedWeight,
    },
  }
}

// ── WorkoutSuggestionSource (id / title / eligible / render) ─────────────────

export interface SourceArgs {
  userId: string
  exerciseSlug: string
}

export interface WorkoutSuggestionSource {
  id: string
  title: string
  eligible(args: SourceArgs): Promise<boolean>
  render(args: SourceArgs): Promise<Suggestion | null>
}

/**
 * Build a progression-nudge Source with an injected session loader. The
 * default export wires the Mongoose loader; tests inject a fixture loader.
 */
export function makeProgressionNudgeSource(
  loadLastSession: LoadLastSession,
): WorkoutSuggestionSource {
  return {
    id: 'workout.progression-nudge',
    title: 'Progression nudge',
    async eligible({ userId, exerciseSlug }) {
      const data = await loadLastSession(userId, exerciseSlug)
      if (!data) return false
      return evaluateProgressionNudge(data) != null
    },
    async render({ userId, exerciseSlug }) {
      const data = await loadLastSession(userId, exerciseSlug)
      if (!data) return null
      const result = evaluateProgressionNudge(data)
      return result ? nudgeToSuggestion(result) : null
    },
  }
}

// ── Default Mongoose loader ──────────────────────────────────────────────────

/**
 * Default loader: most-recent completed workout log containing the slug, plus
 * the exercise's equipment. The prescribed rep range isn't reliably stored on
 * the log, so repRange is left null here — meaning the default path stays
 * silent until a caller supplies a richer loader. Tests inject the full data.
 */
export const defaultLoadLastSession: LoadLastSession = async (
  userId,
  exerciseSlug,
) => {
  const UserProgress = (await import('../../../models/UserProgress')).default
  const Exercise = (await import('../../../models/Exercise')).default
  const slug = exerciseSlug.toLowerCase()

  const doc = await UserProgress
    .findOne({ userId }, { workoutLogs: 1 })
    .lean<{ workoutLogs: Array<{
      date: Date
      completed?: boolean
      exercises?: Array<{ exerciseSlug?: string; sets?: ProgressionSetLog[] }>
    }> } | null>()
  if (!doc) return null

  // Most recent completed session that logged this slug.
  const sessions = (doc.workoutLogs || [])
    .filter(l => l.completed !== false)
    .filter(l => (l.exercises || []).some(e => (e.exerciseSlug || '').toLowerCase() === slug))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const latest = sessions[0]
  if (!latest) return null

  const sets: ProgressionSetLog[] = []
  for (const e of latest.exercises || []) {
    if ((e.exerciseSlug || '').toLowerCase() !== slug) continue
    for (const s of e.sets || []) sets.push(s)
  }

  const ex = await Exercise
    .findOne({ slug }, { name: 1, equipment: 1 })
    .lean<{ name: string; equipment: string[] } | null>()

  return {
    exerciseSlug: slug,
    exerciseName: ex?.name || exerciseSlug,
    equipment: ex?.equipment || [],
    repRange: null, // not reliably available from the log alone
    sets,
    date: new Date(latest.date),
  }
}

// ── Engine registration ──────────────────────────────────────────────────────

/**
 * Engine-compatible wrapper. The engine hands sources a RecentActivity bundle;
 * this reads an optional `exerciseSessions` extension (slug → LastSessionData)
 * if a caller populated it, and renders the nudge for the first eligible one.
 * Absent that data it returns null — so it never duplicates the coarse
 * activity-level progression nudge on today's dashboard.
 *
 * Registered under a distinct registry key ('workout.progression-nudge-dp')
 * so it coexists with the coarse source; both emit the same suggestion-id
 * namespace, so the engine's id-dedup keeps only one per exercise.
 */
export const progressionNudgeEngineSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const sessions = (activity as { exerciseSessions?: Record<string, LastSessionData> })
    .exerciseSessions
  if (!sessions) return null
  for (const data of Object.values(sessions)) {
    const result = evaluateProgressionNudge(data)
    if (result) return nudgeToSuggestion(result)
  }
  return null
}

const ENGINE_KEY = 'workout.progression-nudge-dp'

let registered = false
export function ensureProgressionNudgeRegistered(): void {
  const existing = new Set(listSources().map(s => s.id))
  if (registered && existing.has(ENGINE_KEY)) return
  if (!existing.has(ENGINE_KEY)) {
    registerSource(ENGINE_KEY, 'workout', progressionNudgeEngineSource)
  }
  registered = true
}

export function __resetProgressionNudgeRegistrationForTest(): void {
  registered = false
}

/** Default-wired Source for app use. */
export const progressionNudgeSource = makeProgressionNudgeSource(defaultLoadLastSession)
