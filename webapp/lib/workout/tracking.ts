// What a set of this exercise asks you to log.
//
// The app has always had one vocabulary for this — reps_weight, reps_bodyweight,
// reps_only, time, time_distance, intervals, none — but the paths that rebuild a
// session FROM a saved log invented their own ('reps', 'time') because the log
// did not carry the real type. Anything outside the vocabulary then fell through
// every branch: the Track view dropped the weight column, and the Live view
// showed no inputs at all. A resumed session became unloggable.
//
// So: one normalizer, used everywhere a tracking type arrives from storage, and
// a default that errs toward showing MORE than you need. A weight box on a
// bodyweight movement is a shrug; a missing weight box on a calf raise loses
// the number you came to log.

export type TrackingType =
  | 'reps_weight'
  | 'reps_bodyweight'
  | 'reps_only'
  | 'time'
  | 'time_distance'
  | 'intervals'
  | 'none'

export const TRACKING_TYPES: TrackingType[] = [
  'reps_weight',
  'reps_bodyweight',
  'reps_only',
  'time',
  'time_distance',
  'intervals',
  'none',
]

/** The type used when nothing better is known. */
export const DEFAULT_TRACKING: TrackingType = 'reps_weight'

const ALIASES: Record<string, TrackingType> = {
  // What the rebuild paths used to emit.
  reps: 'reps_weight',
  weight: 'reps_weight',
  weights: 'reps_weight',
  repsweight: 'reps_weight',
  'reps-weight': 'reps_weight',
  bodyweight: 'reps_bodyweight',
  reps_body: 'reps_bodyweight',
  duration: 'time',
  timed: 'time',
  seconds: 'time',
  distance: 'time_distance',
  interval: 'intervals',
  cardio: 'time',
}

export function normalizeTracking(value?: string | null): TrackingType {
  if (!value) return DEFAULT_TRACKING
  const v = String(value).trim().toLowerCase()
  if ((TRACKING_TYPES as string[]).includes(v)) return v as TrackingType
  return ALIASES[v] ?? DEFAULT_TRACKING
}

/** Does this exercise ask for a load? */
export function tracksWeight(value?: string | null): boolean {
  return normalizeTracking(value) === 'reps_weight'
}

/** Is this timed work rather than counted work? */
export function tracksTime(value?: string | null): boolean {
  const t = normalizeTracking(value)
  return t === 'time' || t === 'time_distance' || t === 'intervals'
}

/**
 * The word for one pass through this exercise: "Round" for timed/interval
 * work, "Set" for counted work. Timed exercises were reading as "3 Sets" of
 * a duration, which doesn't parse — the app already calls a lap of interval
 * work a "round" in a couple of places, so this just makes that consistent
 * across every timed tracking type instead of only 'intervals'.
 */
export function setUnitLabel(value: string | null | undefined, count: number): string {
  const noun = tracksTime(value) ? 'round' : 'set'
  const word = count === 1 ? noun : `${noun}s`
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * Does this exercise ask for a speed? Treadmills, bikes, stair climbers: the
 * number on the machine is a speed or a level, not a load.
 */
export function tracksSpeed(value?: string | null): boolean {
  const t = normalizeTracking(value)
  return t === 'time_distance' || t === 'intervals'
}

/**
 * Best guess at a tracking type for a log written before the type was stored.
 * A recorded duration means timed work; a recorded load means loaded work;
 * otherwise fall back to the catalog's answer, then to the default.
 */
export function inferTracking(
  sets: Array<{ reps?: number | null; weight?: number | null; duration?: number | null }> | undefined,
  fromCatalog?: string | null,
): TrackingType {
  const timed = sets?.some(s => (s?.duration ?? 0) > 0 && !((s?.reps ?? 0) > 0))
  if (timed) return 'time'
  const loaded = sets?.some(s => (s?.weight ?? 0) > 0)
  if (loaded) return 'reps_weight'
  return normalizeTracking(fromCatalog)
}

/** The values a member can type against one set, as strings from the inputs. */
export interface TypedSet {
  reps?: string
  weight?: string
  duration?: string
  distance?: string
  speed?: string
}

/**
 * Is this set filled in enough to tick itself off?
 *
 * The Track view auto-checks DONE the moment a set has what its exercise asks
 * for — which only works if the question matches the exercise. A stair climber
 * inside a circuit was being shown reps and weight boxes while this function
 * (correctly) waited for a duration, so the tick never came and the member
 * concluded the check was broken.
 *
 * Unknown types are treated as reps work rather than "never filled": a set that
 * can never tick is worse than one that ticks a little eagerly.
 */
export function isSetFilled(tracking: string | null | undefined, set: TypedSet): boolean {
  const num = (v?: string) => {
    const n = parseFloat((v ?? '').trim())
    return Number.isFinite(n) ? n : 0
  }
  const has = (v?: string) => (v ?? '').trim() !== ''
  switch (normalizeTracking(tracking)) {
    case 'reps_weight':
      return has(set.reps) && has(set.weight) && num(set.reps) > 0
    case 'reps_bodyweight':
    case 'reps_only':
      return has(set.reps) && num(set.reps) > 0
    case 'time':
      return has(set.duration) && num(set.duration) > 0
    case 'intervals':
      // A machine set by speed alone is still a set that happened.
      return (has(set.duration) && num(set.duration) > 0) || (has(set.speed) && num(set.speed) > 0)
    case 'time_distance':
      return (has(set.duration) && num(set.duration) > 0)
        || (has(set.distance) && num(set.distance) > 0)
        || (has(set.speed) && num(set.speed) > 0)
    case 'none':
      // Nothing to type: the member ticks it themselves.
      return false
  }
}
