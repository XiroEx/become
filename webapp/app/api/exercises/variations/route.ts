import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import { buildAlgorithmicVariationQuery } from '@/lib/exerciseVariationMatch'

export interface ExerciseVariation {
  slug: string
  name: string
  equipment: string[]
  laterality: string
  difficulty: string
  trackingType: string
}

// GET /api/exercises/variations?slug=xxx
// Returns the exercise itself + all exercises that are variations of it:
//   - same movementPatterns (exact match)
//   - at least one shared primary muscle (overlap, not containment — see
//     lib/exerciseVariationMatch.ts for why containment silently broke this
//     one-directionally)
//   - same bodyRegion
//   - plus any explicitly linked via the variations[] field
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  await dbConnect()

  const source = await Exercise.findOne({ slug, isActive: true })
    .select('slug name equipment laterality difficulty trackingType variations movementPatterns primaryMuscles bodyRegion')
    .lean()

  if (!source) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // Algorithmic: same movement patterns (exact count + same elements) + at least one shared primary muscle + same region
  const algVariants = source.movementPatterns.length > 0
    ? await Exercise.find(buildAlgorithmicVariationQuery(slug, source))
        .select('slug name equipment laterality difficulty trackingType')
        .lean()
    : []

  // Explicitly linked variations
  const explicitVariants = source.variations?.length
    ? await Exercise.find({ slug: { $in: source.variations }, isActive: true })
        .select('slug name equipment laterality difficulty trackingType')
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
    })
  }

  return NextResponse.json({ variations, sourceSlug: slug })
}
