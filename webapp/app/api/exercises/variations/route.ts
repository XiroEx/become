import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import { visibleExerciseFilter } from '@/lib/exerciseVisibility'
import { buildVariationCandidateQuery, isVariationOf } from '@/lib/exerciseVariationMatch'

export interface ExerciseVariation {
  slug: string
  name: string
  equipment: string[]
  laterality: string
  difficulty: string
  trackingType: string
  /** Needed to swap a variation IN as the live exercise — the live session
   *  writes `category` onto the exercise's `type` and re-derives the
   *  per-implement weight convention from `movementPatterns` + equipment.
   *  Omitting them made an in-place variation switch drop metadata the
   *  Swap Exercise modal has always carried. */
  category: string
  movementPatterns: string[]
}

// Fields the picker renders, plus the three the matcher needs to judge a
// candidate. Kept in one place so the source lookup and the candidate lookup
// can never select different shapes.
const VARIATION_FIELDS =
  'slug name equipment laterality difficulty trackingType category movementPatterns primaryMuscles bodyRegion'

// GET /api/exercises/variations?slug=xxx
// Returns the exercise itself + all exercises that are variations of it:
//   - same real movement-pattern set (the 'n/a' placeholder is not a pattern),
//     OR the same movement family by name — see lib/exerciseMovementFamily.ts,
//     which is what lets an untagged custom exercise find its family without
//     an admin curating it
//   - at least one shared primary muscle (overlap, not containment — see
//     lib/exerciseVariationMatch.ts for why containment silently broke this
//     one-directionally)
//   - same bodyRegion
//   - plus any explicitly linked via the variations[] field
//
// Authenticated, and every query is visibility-scoped: a custom exercise is
// owner-private until an admin approves it, and this route previously applied
// no such filter, so one member's private customs surfaced in another's
// variation picker.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  await dbConnect()

  const source = await Exercise.findOne({
    slug,
    isActive: true,
    ...visibleExerciseFilter(auth.userId),
  })
    .select(`${VARIATION_FIELDS} variations`)
    .lean()

  if (!source) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // Pool: same body region + shared primary muscle + visible to this member.
  // An exercise with no primary muscles tagged has nothing to key the match
  // on, so it gets no algorithmic siblings — only its explicit links.
  const candidates = source.primaryMuscles?.length
    ? await Exercise.find(buildVariationCandidateQuery(slug, source, auth.userId))
        .select(VARIATION_FIELDS)
        .lean()
    : []

  const algVariants = candidates.filter((candidate) => isVariationOf(source, candidate))

  // Explicitly linked variations — the curated allow-list in
  // lib/exerciseVariationLinks.ts, for pairs no rule can infer.
  const explicitVariants = source.variations?.length
    ? await Exercise.find({
        slug: { $in: source.variations },
        isActive: true,
        ...visibleExerciseFilter(auth.userId),
      })
        .select(VARIATION_FIELDS)
        .lean()
    : []

  // Build deduplicated list — source exercise first
  const seen = new Set<string>([slug])
  const variations: ExerciseVariation[] = [
    {
      slug: source.slug,
      name: source.name,
      equipment: source.equipment as string[],
      laterality: source.laterality as string,
      difficulty: source.difficulty as string,
      trackingType: source.trackingType as string,
      category: source.category as string,
      movementPatterns: (source.movementPatterns ?? []) as string[],
    },
  ]

  for (const ex of [...algVariants, ...explicitVariants]) {
    if (seen.has(ex.slug as string)) continue
    seen.add(ex.slug as string)
    variations.push({
      slug: ex.slug as string,
      name: ex.name as string,
      equipment: ex.equipment as string[],
      laterality: ex.laterality as string,
      difficulty: ex.difficulty as string,
      trackingType: ex.trackingType as string,
      category: ex.category as string,
      movementPatterns: (ex.movementPatterns ?? []) as string[],
    })
  }

  return NextResponse.json({ variations, sourceSlug: slug })
}
