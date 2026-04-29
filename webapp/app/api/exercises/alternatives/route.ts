import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import type { IExerciseDefinition, Equipment } from '@/models/Exercise'
import { findAlternatives, type ScoringContext } from '@/lib/exerciseAlternatives'

/**
 * GET /api/exercises/alternatives?slug=barbell-back-squat
 *
 * Query params:
 *   slug          (required)  — exercise to find alternatives for
 *   equipment     (optional)  — comma-separated equipment IDs the user has available
 *   workoutSlugs  (optional)  — comma-separated exercise slugs already in the workout
 *   programRole   (optional)  — the role this exercise plays in the program (compound|secondary|accessory)
 *   workoutFocus  (optional)  — body region focus of the current workout
 *   limit         (optional)  — max results (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    const equipmentParam = searchParams.get('equipment')
    const workoutSlugsParam = searchParams.get('workoutSlugs')
    const programRole = searchParams.get('programRole') || undefined
    const workoutFocus = searchParams.get('workoutFocus') || undefined
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50)

    await dbConnect()

    // Load the source exercise
    const source = await Exercise.findOne({ slug, isActive: true }).lean() as IExerciseDefinition | null
    if (!source) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    // Load all active exercises (cached by Mongoose connection pooling in practice)
    const allExercises = await Exercise.find({ isActive: true }).lean() as IExerciseDefinition[]

    const context: ScoringContext = {
      availableEquipment: equipmentParam
        ? equipmentParam.split(',').filter(Boolean) as Equipment[]
        : [],
      workoutExerciseSlugs: workoutSlugsParam
        ? workoutSlugsParam.split(',').filter(Boolean)
        : [],
      programRole,
      workoutFocus,
    }

    const alternatives = findAlternatives(source, allExercises, context, limit)

    return NextResponse.json({
      source: {
        slug: source.slug,
        name: source.name,
        primaryMuscles: source.primaryMuscles,
        movementPatterns: source.movementPatterns,
        equipment: source.equipment,
        bodyRegion: source.bodyRegion,
        role: source.role,
        category: source.category,
      },
      alternatives,
      total: alternatives.length,
    })
  } catch (error) {
    console.error('Error finding alternatives:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
