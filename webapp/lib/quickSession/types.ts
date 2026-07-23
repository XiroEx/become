// Shared types for the Quick Session + Generate features.
//
// A "quick session" is a workout not attached to any program. The same
// in-flight shape (DraftSession) is produced three ways:
//   1. the builder (user hand-picks exercises),
//   2. a focus chip / preset (one-tap suggested session),
//   3. the generator (algorithmic, with a splash of randomness).
// It is then handed to the live workout engine (see lib/quickSession/store.ts)
// and saved as a kind:'quick' workout log.
//
// Pure types only — no React/DOM/Mongoose. Safe to import anywhere.

export type FocusKey =
  | 'full_body'
  | 'upper'
  | 'lower'
  | 'push'
  | 'pull'
  | 'legs'
  | 'core'
  | 'arms'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'cardio'

/**
 * Declarative definition of a training focus. Drives both the UI chips and the
 * server-side candidate query / generator scoring. A candidate matches a focus
 * if it hits the focus's bodyRegions OR muscles OR movementPatterns.
 */
export interface FocusDef {
  key: FocusKey
  label: string
  /** Short tagline for the chip / card. */
  blurb: string
  /** Body regions to draw from (matched against Exercise.bodyRegion). */
  bodyRegions: string[]
  /** Primary muscles that count as "on focus". */
  muscles: string[]
  /** Movement patterns that count as "on focus". */
  movementPatterns: string[]
  /** Exercise categories to draw from (defaults to strength-ish). */
  categories?: string[]
}

/** A single exercise in a draft session (pre-logging). */
export interface DraftExercise {
  exerciseSlug: string
  name: string
  trackingType: string
  sets: number
  reps: string // e.g. "8-12" or "" for time-based
  rest?: string
  duration?: string // timed prescription for time-based tracking
  primaryMuscles?: string[]
}

/** An in-flight, program-less session. */
export interface DraftSession {
  title: string
  focus?: FocusKey
  exercises: DraftExercise[]
}

/** Minimal exercise shape the pure generator consumes (decoupled from Mongo). */
export interface CandidateExercise {
  slug: string
  name: string
  category: string
  role: string // 'compound' | 'secondary' | 'accessory'
  mechanics?: string // 'compound' | 'isolation' | 'n/a'
  movementPatterns: string[]
  primaryMuscles: string[]
  equipment: string[]
  difficulty: string
  trackingType: string
  bodyRegion: string
  defaultSets?: number
  defaultReps?: string
  defaultRest?: string
  defaultDuration?: string
}

export interface GenerateSessionOptions {
  focus: FocusKey
  /** Target number of exercises (clamped 3–10). */
  exerciseCount?: number
  /** Cap difficulty — exercises at this level or easier are eligible. */
  difficulty?: string
  /** Available equipment. Empty/omitted = no equipment constraint. */
  equipment?: string[]
  /** Allow a cardio finisher even on a strength focus. */
  includeCardio?: boolean
  /** Seed for the splash of randomness (deterministic per seed). */
  seed?: number
}

export type CompleteSessionMode = 'finish' | 'suggest'

export interface CompleteSessionExerciseInput {
  exerciseSlug: string
  name?: string
  trackingType?: string
  sets?: number
  reps?: string
  rest?: string
  duration?: string
}

export interface CompleteSessionOptions {
  exercises: CompleteSessionExerciseInput[]
  mode?: CompleteSessionMode
  /** Target total exercise count for finish mode (clamped 3–10 by the engine). */
  exerciseCount?: number
  /** Number of one-tap suggestions to return (clamped 1–6 by the route). */
  suggestionCount?: number
  difficulty?: string
  equipment?: string[]
  seed?: number
}

export interface ComplementSuggestion {
  exercise: DraftExercise
  reason: string
}

export interface CompleteSessionFinishResponse {
  session: DraftSession
  seed: number
}

export interface CompleteSessionSuggestResponse {
  suggestions: ComplementSuggestion[]
  seed: number
}

export type CompleteSessionResponse =
  | CompleteSessionFinishResponse
  | CompleteSessionSuggestResponse

export interface GenerateProgramOptions {
  focus: FocusKey
  /** Training days per week (clamped 2–6). */
  daysPerWeek?: number
  /** Program length in weeks (clamped 2–12). */
  weeks?: number
  exercisesPerDay?: number
  difficulty?: string
  equipment?: string[]
  seed?: number
}

export interface DraftProgramDay {
  day: string // "Day 1"
  title: string // "Push", "Pull", ...
  focus: FocusKey
  exercises: DraftExercise[]
}

export interface DraftProgram {
  name: string
  description: string
  focus?: FocusKey
  daysPerWeek: number
  weeks: number
  days: DraftProgramDay[]
}

// ─── Focus catalog ───────────────────────────────────────────────────────────

const STRENGTH_CATS = ['strength', 'power', 'calisthenics', 'olympic']

export const FOCUS_DEFS: Record<FocusKey, FocusDef> = {
  full_body: {
    key: 'full_body',
    label: 'Full Body',
    blurb: 'A bit of everything',
    bodyRegions: ['upper_body', 'lower_body', 'core', 'full_body'],
    muscles: [],
    movementPatterns: ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'lunge'],
    categories: STRENGTH_CATS,
  },
  upper: {
    key: 'upper',
    label: 'Upper Body',
    blurb: 'Chest, back, shoulders, arms',
    bodyRegions: ['upper_body'],
    muscles: [],
    movementPatterns: ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull'],
    categories: STRENGTH_CATS,
  },
  lower: {
    key: 'lower',
    label: 'Lower Body',
    blurb: 'Quads, hams, glutes, calves',
    bodyRegions: ['lower_body'],
    muscles: [],
    movementPatterns: ['squat', 'hinge', 'lunge', 'knee_extension', 'knee_flexion', 'hip_extension'],
    categories: STRENGTH_CATS,
  },
  push: {
    key: 'push',
    label: 'Push',
    blurb: 'Chest, shoulders, triceps',
    bodyRegions: ['upper_body'],
    muscles: ['chest', 'upper_chest', 'lower_chest', 'front_delts', 'side_delts', 'triceps'],
    movementPatterns: ['horizontal_push', 'vertical_push', 'elbow_extension', 'shoulder_abduction', 'shoulder_flexion'],
    categories: STRENGTH_CATS,
  },
  pull: {
    key: 'pull',
    label: 'Pull',
    blurb: 'Back, rear delts, biceps',
    bodyRegions: ['upper_body'],
    muscles: ['lats', 'upper_back', 'mid_back', 'lower_back', 'rhomboids', 'traps', 'rear_delts', 'biceps', 'brachialis'],
    movementPatterns: ['horizontal_pull', 'vertical_pull', 'elbow_flexion', 'scapular_retraction'],
    categories: STRENGTH_CATS,
  },
  legs: {
    key: 'legs',
    label: 'Legs',
    blurb: 'Quads, hamstrings, glutes',
    bodyRegions: ['lower_body'],
    muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
    movementPatterns: ['squat', 'hinge', 'lunge', 'knee_extension', 'knee_flexion', 'hip_extension', 'ankle_flexion'],
    categories: STRENGTH_CATS,
  },
  core: {
    key: 'core',
    label: 'Core',
    blurb: 'Abs, obliques, stability',
    bodyRegions: ['core'],
    muscles: ['abs', 'obliques', 'transverse_abdominis', 'erector_spinae'],
    movementPatterns: ['anti_rotation', 'anti_extension', 'anti_lateral_flexion', 'rotation'],
    categories: ['strength', 'calisthenics'],
  },
  arms: {
    key: 'arms',
    label: 'Arms',
    blurb: 'Biceps & triceps',
    bodyRegions: ['upper_body'],
    muscles: ['biceps', 'triceps', 'forearms', 'brachialis'],
    movementPatterns: ['elbow_flexion', 'elbow_extension'],
    categories: STRENGTH_CATS,
  },
  chest: {
    key: 'chest',
    label: 'Chest',
    blurb: 'Pecs, front delts',
    bodyRegions: ['upper_body'],
    muscles: ['chest', 'upper_chest', 'lower_chest'],
    movementPatterns: ['horizontal_push', 'horizontal_adduction'],
    categories: STRENGTH_CATS,
  },
  back: {
    key: 'back',
    label: 'Back',
    blurb: 'Lats, traps, mid-back',
    bodyRegions: ['upper_body'],
    muscles: ['lats', 'upper_back', 'mid_back', 'lower_back', 'rhomboids', 'traps', 'teres_major'],
    movementPatterns: ['horizontal_pull', 'vertical_pull', 'scapular_retraction'],
    categories: STRENGTH_CATS,
  },
  shoulders: {
    key: 'shoulders',
    label: 'Shoulders',
    blurb: 'Delts & traps',
    bodyRegions: ['upper_body'],
    muscles: ['front_delts', 'side_delts', 'rear_delts', 'traps', 'rotator_cuff'],
    movementPatterns: ['vertical_push', 'shoulder_abduction', 'shoulder_flexion'],
    categories: STRENGTH_CATS,
  },
  cardio: {
    key: 'cardio',
    label: 'Cardio',
    blurb: 'Conditioning & intervals',
    bodyRegions: ['full_body', 'lower_body'],
    muscles: [],
    movementPatterns: ['gait', 'triple_extension'],
    categories: ['cardio', 'conditioning', 'plyometric'],
  },
}

/** Focus chips shown in the Quick Session modal, in display order. */
export const QUICK_FOCUS_ORDER: FocusKey[] = [
  'full_body',
  'push',
  'pull',
  'legs',
  'upper',
  'lower',
  'core',
  'arms',
  'cardio',
]

export function isFocusKey(v: unknown): v is FocusKey {
  return typeof v === 'string' && v in FOCUS_DEFS
}
