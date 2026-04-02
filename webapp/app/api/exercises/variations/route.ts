import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Exercise from '@/models/Exercise'

export interface ExerciseVariation {
  slug: string
  name: string
  equipment: string[]
  laterality: string
  difficulty: string
}

// GET /api/exercises/variations?slug=xxx
// Returns the exercise itself + all exercises that are variations of it:
//   - same movementPatterns (exact match)
//   - same primary muscles (all source muscles present)
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
    .select('slug name equipment laterality difficulty variations movementPatterns primaryMuscles bodyRegion')
    .lean()

  if (!source) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // Algorithmic: same movement patterns (exact count + same elements) + source muscles present + same region
  const algVariants = source.movementPatterns.length > 0
    ? await Exercise.find({
        slug: { $ne: slug },
        isActive: true,
        bodyRegion: source.bodyRegion,
        movementPatterns: { $size: source.movementPatterns.length, $all: source.movementPatterns },
        primaryMuscles: { $all: source.primaryMuscles },
      })
        .select('slug name equipment laterality difficulty')
        .lean()
    : []

  // Explicitly linked variations
  const explicitVariants = source.variations?.length
    ? await Exercise.find({ slug: { $in: source.variations }, isActive: true })
        .select('slug name equipment laterality difficulty')
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
    })
  }

  return NextResponse.json({ variations, sourceSlug: slug })
}
