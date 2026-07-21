// Pure session/program generator over an exercise catalog.
//
// "Algorithmic with a splash of randomness": exercises are filtered + scored
// for the chosen focus, partitioned into compound vs accessory tiers, shuffled
// with a SEEDED RNG (so a given seed reproduces, but different seeds vary), then
// greedily selected to maximize distinct primary-muscle coverage. Sets/reps are
// assigned from the exercise's own defaults, falling back to role-based
// heuristics.
//
// No IO — the caller supplies CandidateExercise[] (the API route queries Mongo).
// This keeps the algorithm unit-testable and deterministic per seed.

import {
  FOCUS_DEFS,
  type CandidateExercise,
  type DraftExercise,
  type DraftSession,
  type DraftProgram,
  type DraftProgramDay,
  type FocusKey,
  type GenerateSessionOptions,
  type GenerateProgramOptions,
} from './types'

// ─── Seeded RNG (mulberry32) ─────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ─── Difficulty ordering ─────────────────────────────────────────────────────

const DIFFICULTY_RANK: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
}

export function difficultyAllowed(candidate: string, cap?: string): boolean {
  if (!cap) return true
  const c = DIFFICULTY_RANK[candidate] ?? 2
  const max = DIFFICULTY_RANK[cap] ?? 4
  return c <= max
}

// ─── Focus matching + scoring ────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * How well a candidate fits a focus. 0 = off-focus (excluded). Higher = better
 * fit: muscle hits weigh most, then movement pattern, then body region.
 */
export function focusScore(ex: CandidateExercise, focus: FocusKey): number {
  const def = FOCUS_DEFS[focus]
  let score = 0

  const cats = def.categories
  if (cats && cats.length && !cats.includes(ex.category)) {
    // Off-category but allow a strong muscle match to rescue it (e.g. a
    // calisthenics pull-up on a "pull" focus); pure cardio stays excluded.
  }

  if (def.muscles.length) {
    const hits = ex.primaryMuscles.filter((m) => def.muscles.includes(m)).length
    score += hits * 3
  }
  if (def.movementPatterns.length) {
    const hits = ex.movementPatterns.filter((p) => def.movementPatterns.includes(p)).length
    score += hits * 2
  }
  if (def.bodyRegions.includes(ex.bodyRegion)) score += 1

  // For muscle-less focuses (full_body / upper / lower), region match alone
  // qualifies — they're defined by region, not specific muscles.
  if (def.muscles.length === 0 && def.bodyRegions.includes(ex.bodyRegion)) {
    score += 2
  }

  return score
}

export function hasEquipment(ex: CandidateExercise, available?: string[]): boolean {
  if (!available || available.length === 0) return true
  // Bodyweight / none always pass — no equipment needed.
  if (ex.equipment.length === 0) return true
  if (ex.equipment.every((e) => e === 'bodyweight' || e === 'none')) return true
  return ex.equipment.some((e) => available.includes(e) || e === 'bodyweight' || e === 'none')
}

export function isCompound(ex: CandidateExercise): boolean {
  return ex.role === 'compound' || ex.role === 'secondary' || ex.mechanics === 'compound'
}

// ─── Sets / reps prescription ────────────────────────────────────────────────

function prescribe(ex: CandidateExercise): { sets: number; reps: string; rest?: string; duration?: string } {
  // Honor the catalog's own defaults when present.
  const sets = ex.defaultSets ?? (isCompound(ex) ? 4 : 3)

  if (ex.trackingType === 'time' || ex.trackingType === 'intervals') {
    return { sets, reps: '', duration: ex.defaultDuration ?? '45 sec', rest: ex.defaultRest ?? '60s' }
  }
  if (ex.trackingType === 'time_distance') {
    return { sets: ex.defaultSets ?? 1, reps: '', duration: ex.defaultDuration ?? '10 min', rest: ex.defaultRest ?? '60s' }
  }

  if (ex.defaultReps) {
    return { sets, reps: ex.defaultReps, rest: ex.defaultRest ?? (isCompound(ex) ? '90s' : '60s') }
  }
  // Heuristic: compounds in the strength range, accessories in the hypertrophy range.
  const reps = isCompound(ex) ? '6-8' : '10-15'
  return { sets, reps, rest: isCompound(ex) ? '90s' : '60s' }
}

export function toDraftExercise(ex: CandidateExercise): DraftExercise {
  const p = prescribe(ex)
  return {
    exerciseSlug: ex.slug,
    name: ex.name,
    trackingType: ex.trackingType,
    sets: p.sets,
    reps: p.reps,
    ...(p.rest && { rest: p.rest }),
    ...(p.duration && { duration: p.duration }),
    primaryMuscles: ex.primaryMuscles,
  }
}

// ─── Core selection ──────────────────────────────────────────────────────────

interface SelectResult {
  chosen: CandidateExercise[]
}

/**
 * Greedily select `count` exercises for a focus: lead with compounds, fill with
 * accessories, and bias toward covering distinct primary muscles so the session
 * isn't five variations of the same movement. Ties broken by the seeded shuffle.
 */
function selectExercises(
  candidates: CandidateExercise[],
  focus: FocusKey,
  count: number,
  rng: () => number,
): SelectResult {
  const scored = candidates
    .map((ex) => ({ ex, score: focusScore(ex, focus) }))
    .filter((x) => x.score > 0)

  if (scored.length === 0) return { chosen: [] }

  // Shuffle first (splash of randomness), then stable-sort by score so equal
  // scores keep their shuffled order.
  const shuffled = seededShuffle(scored, rng)
  shuffled.sort((a, b) => b.score - a.score)

  const compounds = shuffled.filter((x) => isCompound(x.ex)).map((x) => x.ex)
  const accessories = shuffled.filter((x) => !isCompound(x.ex)).map((x) => x.ex)

  // Aim ~40% compounds (at least 1, at most 3 for a single session).
  const targetCompounds = clamp(Math.round(count * 0.4), 1, 3)

  const chosen: CandidateExercise[] = []
  const usedSlugs = new Set<string>()
  const muscleCount = new Map<string, number>()

  const muscleLoad = (ex: CandidateExercise) =>
    ex.primaryMuscles.reduce((sum, m) => sum + (muscleCount.get(m) ?? 0), 0)

  const take = (pool: CandidateExercise[], limit: number) => {
    while (chosen.length < limit && pool.length) {
      // Among the next few candidates (already score-ordered), prefer the one
      // adding the least-covered muscles — spreads stimulus across the focus.
      const window = pool.filter((e) => !usedSlugs.has(e.slug)).slice(0, 5)
      if (window.length === 0) break
      window.sort((a, b) => muscleLoad(a) - muscleLoad(b))
      const pick = window[0]
      chosen.push(pick)
      usedSlugs.add(pick.slug)
      for (const m of pick.primaryMuscles) muscleCount.set(m, (muscleCount.get(m) ?? 0) + 1)
      const idx = pool.findIndex((e) => e.slug === pick.slug)
      if (idx >= 0) pool.splice(idx, 1)
    }
  }

  take(compounds, Math.min(targetCompounds, count))
  take(accessories, count)
  // If accessories ran dry, top up from remaining compounds.
  if (chosen.length < count) take(compounds, count)

  return { chosen }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generateSession(
  candidates: CandidateExercise[],
  opts: GenerateSessionOptions,
): DraftSession {
  const focus = opts.focus
  const count = clamp(opts.exerciseCount ?? 5, 3, 10)
  const seed = (opts.seed ?? 1) >>> 0
  const rng = mulberry32(seed || 1)

  const eligible = candidates.filter(
    (ex) => difficultyAllowed(ex.difficulty, opts.difficulty) && hasEquipment(ex, opts.equipment),
  )

  const { chosen } = selectExercises(eligible, focus, count, rng)

  const exercises = chosen.map(toDraftExercise)

  // Optional cardio finisher on a strength focus.
  if (opts.includeCardio && focus !== 'cardio') {
    const cardio = candidates.filter(
      (ex) =>
        (ex.category === 'cardio' || ex.category === 'conditioning') &&
        hasEquipment(ex, opts.equipment) &&
        !chosen.some((c) => c.slug === ex.slug),
    )
    if (cardio.length) {
      const finisher = seededShuffle(cardio, rng)[0]
      exercises.push(toDraftExercise(finisher))
    }
  }

  return {
    title: `${FOCUS_DEFS[focus].label} Session`,
    focus,
    exercises,
  }
}

// ─── Program generation ──────────────────────────────────────────────────────

// A split is an ordered list of per-day focuses keyed by days-per-week.
const SPLITS: Record<number, FocusKey[]> = {
  2: ['upper', 'lower'],
  3: ['push', 'pull', 'legs'],
  4: ['upper', 'lower', 'push', 'pull'],
  5: ['push', 'pull', 'legs', 'upper', 'lower'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
}

export function splitFor(focus: FocusKey, days: number): FocusKey[] {
  // A specific focus (e.g. "legs") repeats that focus across the week; the
  // general focuses use a balanced split.
  if (focus === 'full_body' || focus === 'upper' || focus === 'lower') {
    return SPLITS[days] ?? SPLITS[3]
  }
  if (['push', 'pull', 'legs'].includes(focus)) {
    return SPLITS[days] ?? SPLITS[3]
  }
  // Niche focus (arms/core/chest/etc.) — alternate the focus with full_body so
  // the week isn't monotonous.
  return Array.from({ length: days }, (_, i) => (i % 2 === 0 ? focus : 'full_body'))
}

export function generateProgram(
  candidates: CandidateExercise[],
  opts: GenerateProgramOptions,
): DraftProgram {
  const daysPerWeek = clamp(opts.daysPerWeek ?? 3, 2, 6)
  const weeks = clamp(opts.weeks ?? 4, 2, 12)
  const perDay = clamp(opts.exercisesPerDay ?? 5, 3, 8)
  const baseSeed = (opts.seed ?? 1) >>> 0

  const eligible = candidates.filter(
    (ex) => difficultyAllowed(ex.difficulty, opts.difficulty) && hasEquipment(ex, opts.equipment),
  )

  const dayFocuses = splitFor(opts.focus, daysPerWeek)

  const days: DraftProgramDay[] = dayFocuses.map((dayFocus, i) => {
    const rng = mulberry32((baseSeed + i * 2654435761) >>> 0 || 1)
    const { chosen } = selectExercises(eligible, dayFocus, perDay, rng)
    return {
      day: `Day ${i + 1}`,
      title: FOCUS_DEFS[dayFocus].label,
      focus: dayFocus,
      exercises: chosen.map(toDraftExercise),
    }
  })

  const label = FOCUS_DEFS[opts.focus].label
  return {
    name: `${label} ${daysPerWeek}-Day Program`,
    description: `An auto-generated ${weeks}-week, ${daysPerWeek}-day ${label.toLowerCase()} program.`,
    focus: opts.focus,
    daysPerWeek,
    weeks,
    days,
  }
}

// ─── Draft → Program create body ─────────────────────────────────────────────

const DIFFICULTY_TO_TARGET: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Advanced',
}

/**
 * Convert a generated DraftProgram into the body shape POST /api/programs/custom
 * expects (phases → workouts → exercises). Single phase spanning all weeks; the
 * generated split becomes that phase's workouts. Pure — no IO.
 */
export function draftProgramToProgramBody(
  program: DraftProgram,
  difficulty?: string,
): Record<string, unknown> {
  return {
    name: program.name,
    description: program.description,
    duration_weeks: program.weeks,
    training_days_per_week: program.daysPerWeek,
    goal: 'General Fitness',
    target_user: DIFFICULTY_TO_TARGET[difficulty ?? 'intermediate'] ?? 'Intermediate',
    tags: ['generated'],
    phases: [
      {
        phase: 'Phase 1',
        weeks: `1-${program.weeks}`,
        focus: FOCUS_DEFS[program.focus ?? program.days[0]?.focus ?? 'full_body'].label,
        workouts: program.days.map((d) => ({
          day: d.day,
          title: d.title,
          exercises: d.exercises.map((e) => ({
            exerciseSlug: e.exerciseSlug,
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            ...(e.rest && { rest: e.rest }),
            ...(e.duration && { duration: e.duration }),
          })),
        })),
      },
    ],
  }
}
