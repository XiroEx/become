// Server-only: pull a candidate exercise pool from Mongo for one or more
// focuses, mapped to the pure generator's CandidateExercise shape. Unions the
// focuses' body regions / muscles / movement patterns so a program split that
// spans several focuses gets a pool covering all of them in one query.

import Exercise from '@/models/Exercise'
import { FOCUS_DEFS, type CandidateExercise, type FocusKey } from './types'

const CANDIDATE_PROJECTION =
  'slug name category role mechanics movementPatterns primaryMuscles equipment difficulty trackingType bodyRegion defaultSets defaultReps defaultRest defaultDuration'

interface CandidateExerciseDoc {
  slug: string
  name: string
  category?: string
  role?: string
  mechanics?: string
  movementPatterns?: string[]
  primaryMuscles?: string[]
  equipment?: string[]
  difficulty?: string
  trackingType?: string
  bodyRegion?: string
  defaultSets?: number
  defaultReps?: string
  defaultRest?: string
  defaultDuration?: string
}

function toCandidateExercise(d: CandidateExerciseDoc): CandidateExercise {
  return {
    slug: d.slug,
    name: d.name,
    category: d.category ?? 'strength',
    role: d.role ?? 'accessory',
    mechanics: d.mechanics,
    movementPatterns: d.movementPatterns ?? [],
    primaryMuscles: d.primaryMuscles ?? [],
    equipment: d.equipment ?? [],
    difficulty: d.difficulty ?? 'intermediate',
    trackingType: d.trackingType ?? 'reps_weight',
    bodyRegion: d.bodyRegion ?? 'full_body',
    defaultSets: d.defaultSets,
    defaultReps: d.defaultReps,
    defaultRest: d.defaultRest,
    defaultDuration: d.defaultDuration,
  }
}

export async function fetchCandidates(
  focuses: FocusKey[],
  limit = 250,
): Promise<CandidateExercise[]> {
  const regions = new Set<string>()
  const muscles = new Set<string>()
  const patterns = new Set<string>()
  const categories = new Set<string>()

  for (const f of focuses) {
    const def = FOCUS_DEFS[f]
    def.bodyRegions.forEach((r) => regions.add(r))
    def.muscles.forEach((m) => muscles.add(m))
    def.movementPatterns.forEach((p) => patterns.add(p))
    ;(def.categories ?? []).forEach((c) => categories.add(c))
  }

  const or: Record<string, unknown>[] = []
  if (muscles.size) or.push({ primaryMuscles: { $in: [...muscles] } })
  if (patterns.size) or.push({ movementPatterns: { $in: [...patterns] } })
  if (regions.size) or.push({ bodyRegion: { $in: [...regions] } })

  const filter: Record<string, unknown> = {
    isCustom: { $ne: true },
    isActive: { $ne: false },
  }
  if (or.length) filter.$or = or

  const docs = await Exercise.find(filter)
    .select(CANDIDATE_PROJECTION)
    .limit(limit)
    .lean<CandidateExerciseDoc[]>()

  return docs.map(toCandidateExercise)
}

/** Resolve catalog metadata for exercises already present in a draft. */
export async function fetchCandidatesBySlugs(slugs: string[]): Promise<CandidateExercise[]> {
  const uniqueSlugs = [...new Set(slugs.filter((slug) => slug.length > 0))]
  if (uniqueSlugs.length === 0) return []

  const docs = await Exercise.find({
    slug: { $in: uniqueSlugs },
    isCustom: { $ne: true },
    isActive: { $ne: false },
  })
    .select(CANDIDATE_PROJECTION)
    .lean<CandidateExerciseDoc[]>()

  return docs.map(toCandidateExercise)
}
