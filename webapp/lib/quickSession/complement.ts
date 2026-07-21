// Pure complement selection for partially built quick sessions.
//
// The builder supplies the exercises already chosen by the user and this
// module finds eligible, non-duplicate exercises that cover the least-served
// muscles and movement patterns in that draft. There is no IO or UI coupling;
// callers can use the same deterministic seed for repeatable suggestions.

import {
  FOCUS_DEFS,
  type CandidateExercise,
  type DraftExercise,
  type FocusKey,
} from './types'
import {
  difficultyAllowed,
  focusScore,
  hasEquipment,
  isCompound,
  mulberry32,
  seededShuffle,
  toDraftExercise,
} from './generate'

export interface SessionCoverage {
  primaryMuscles: Record<string, number>
  movementPatterns: Record<string, number>
  bodyRegions: Record<string, number>
}

export interface ComplementOptions {
  difficulty?: string
  equipment?: string[]
  seed?: number
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1
}

function countCoverage(seeds: CandidateExercise[]): SessionCoverage {
  const coverage: SessionCoverage = {
    primaryMuscles: {},
    movementPatterns: {},
    bodyRegions: {},
  }

  for (const seed of seeds) {
    for (const muscle of new Set(seed.primaryMuscles)) increment(coverage.primaryMuscles, muscle)
    for (const pattern of new Set(seed.movementPatterns)) increment(coverage.movementPatterns, pattern)
    increment(coverage.bodyRegions, seed.bodyRegion)
  }

  return coverage
}

/** Infer the closest focus while retaining the raw coverage gaps in the draft. */
export function inferSessionCriteria(seeds: CandidateExercise[]): { focus: FocusKey; coverage: SessionCoverage } {
  const coverage = countCoverage(seeds)
  if (seeds.length === 0) return { focus: 'full_body', coverage }

  let bestFocus: FocusKey = 'full_body'
  let bestScore = 0

  for (const focus of Object.keys(FOCUS_DEFS) as FocusKey[]) {
    const score = seeds.reduce((total, seed) => total + focusScore(seed, focus), 0)
    if (score > bestScore) {
      bestFocus = focus
      bestScore = score
    }
  }

  return { focus: bestFocus, coverage }
}

function complementScore(
  candidate: CandidateExercise,
  focus: FocusKey,
  coverage: SessionCoverage,
): number {
  const muscleGap = candidate.primaryMuscles.reduce(
    (total, muscle) => total + 1 / (1 + (coverage.primaryMuscles[muscle] ?? 0)),
    0,
  )
  const patternGap = candidate.movementPatterns.reduce(
    (total, pattern) => total + 1 / (1 + (coverage.movementPatterns[pattern] ?? 0)),
    0,
  )
  const regionGap = 1 / (1 + (coverage.bodyRegions[candidate.bodyRegion] ?? 0))

  // Coverage gaps dominate focus fit so a complementary muscle wins over a
  // duplicate variation, while the inferred focus still filters out unrelated
  // catalog entries and compound movements get a small tie-break preference.
  return (
    muscleGap * 100 +
    patternGap * 20 +
    regionGap * 5 +
    focusScore(candidate, focus) +
    (isCompound(candidate) ? 0.25 : 0)
  )
}

function uniqueEligible(
  candidates: CandidateExercise[],
  seeds: CandidateExercise[],
  opts: ComplementOptions,
): CandidateExercise[] {
  const seedSlugs = new Set(seeds.map((seed) => seed.slug))
  const seen = new Set(seedSlugs)

  return candidates.filter((candidate) => {
    if (seen.has(candidate.slug)) return false
    if (!difficultyAllowed(candidate.difficulty, opts.difficulty)) return false
    if (!hasEquipment(candidate, opts.equipment)) return false
    seen.add(candidate.slug)
    return true
  })
}

function addCoverage(coverage: SessionCoverage, candidate: CandidateExercise): void {
  for (const muscle of new Set(candidate.primaryMuscles)) increment(coverage.primaryMuscles, muscle)
  for (const pattern of new Set(candidate.movementPatterns)) increment(coverage.movementPatterns, pattern)
  increment(coverage.bodyRegions, candidate.bodyRegion)
}

/** Select complementary candidates without returning any seed or duplicate slug. */
export function selectComplements(
  candidates: CandidateExercise[],
  seeds: CandidateExercise[],
  count: number,
  opts: ComplementOptions = {},
): CandidateExercise[] {
  if (count <= 0 || candidates.length === 0) return []

  const { focus, coverage } = inferSessionCriteria(seeds)
  const available = uniqueEligible(candidates, seeds, opts).filter((candidate) => focusScore(candidate, focus) > 0)
  const rng = mulberry32((opts.seed ?? 1) >>> 0 || 1)
  const chosen: CandidateExercise[] = []
  const workingCoverage: SessionCoverage = {
    primaryMuscles: { ...coverage.primaryMuscles },
    movementPatterns: { ...coverage.movementPatterns },
    bodyRegions: { ...coverage.bodyRegions },
  }

  for (let i = 0; i < count && available.length > 0; i++) {
    const ranked = seededShuffle(available, rng)
    ranked.sort((a, b) => complementScore(b, focus, workingCoverage) - complementScore(a, focus, workingCoverage))
    const pick = ranked[0]
    if (!pick) break
    chosen.push(pick)
    addCoverage(workingCoverage, pick)
    const index = available.findIndex((candidate) => candidate.slug === pick.slug)
    if (index >= 0) available.splice(index, 1)
  }

  return chosen
}

/** Return only the exercises that should be appended to an existing draft. */
export function completeDraft(
  candidates: CandidateExercise[],
  seeds: CandidateExercise[],
  opts: ComplementOptions & { targetTotal?: number } = {},
): DraftExercise[] {
  if (seeds.length >= 10) return []

  const requestedTotal = Math.max(3, Math.min(10, opts.targetTotal ?? 5))
  const targetTotal = Math.min(10, Math.max(requestedTotal, seeds.length + 1))
  const count = targetTotal - seeds.length
  if (count <= 0) return []

  return selectComplements(candidates, seeds, count, opts).map(toDraftExercise)
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

function reasonFor(candidate: CandidateExercise, coverage: SessionCoverage): string {
  const muscle = candidate.primaryMuscles
    .map((value) => ({ value, load: coverage.primaryMuscles[value] ?? 0 }))
    .sort((a, b) => a.load - b.load)[0]
  if (muscle) {
    return `hits ${humanize(muscle.value)} — ${muscle.load === 0 ? 'untrained so far' : `only ${muscle.load} hit so far`}`
  }

  const pattern = candidate.movementPatterns
    .map((value) => ({ value, load: coverage.movementPatterns[value] ?? 0 }))
    .sort((a, b) => a.load - b.load)[0]
  if (pattern) {
    return `adds ${humanize(pattern.value)} — ${pattern.load === 0 ? 'untrained so far' : `only ${pattern.load} hit so far`}`
  }

  const regionLoad = coverage.bodyRegions[candidate.bodyRegion] ?? 0
  return `adds ${humanize(candidate.bodyRegion)} — ${regionLoad === 0 ? 'untrained so far' : `only ${regionLoad} hit so far`}`
}

/** Build tappable suggestion payloads with a concise explanation of each gap. */
export function suggestComplements(
  candidates: CandidateExercise[],
  seeds: CandidateExercise[],
  n: number,
  opts: ComplementOptions = {},
): Array<{ exercise: DraftExercise; reason: string }> {
  if (n <= 0) return []
  const selected = selectComplements(candidates, seeds, n, opts)
  const { coverage } = inferSessionCriteria(seeds)
  return selected.map((candidate) => ({ exercise: toDraftExercise(candidate), reason: reasonFor(candidate, coverage) }))
}
