import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { epley1RM, type IExercisePR } from '@/lib/exercisePRs'
import { bustTilesCache } from '@/lib/redis'

const MAX_WEIGHT = 100_000
const MAX_REPS = 100_000

function validSlug(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180
}

// PATCH /api/progress/prs — correct the persisted record shown in the Training
// Log. This intentionally does not rewrite a historical set: that separate
// workflow lives on each workout row and triggers a complete PR replay.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null) as {
      exerciseSlug?: unknown
      weight?: unknown
      reps?: unknown
    } | null
    const exerciseSlug = body?.exerciseSlug
    const weight = body?.weight
    const reps = body?.reps
    if (!validSlug(exerciseSlug)) {
      return NextResponse.json({ error: 'A valid exercise is required' }, { status: 400 })
    }
    if (
      typeof weight !== 'number' || !Number.isFinite(weight) ||
      weight <= 0 || weight > MAX_WEIGHT
    ) {
      return NextResponse.json({ error: `Weight must be greater than 0 and no more than ${MAX_WEIGHT}` }, { status: 400 })
    }
    if (
      typeof reps !== 'number' || !Number.isInteger(reps) ||
      reps <= 0 || reps > MAX_REPS
    ) {
      return NextResponse.json({ error: `Reps must be a whole number between 1 and ${MAX_REPS}` }, { status: 400 })
    }

    await dbConnect()
    const progress = await UserProgress.findOne({ userId: auth.userId })
    if (!progress) return NextResponse.json({ error: 'Personal record not found' }, { status: 404 })

    const pr = progress.exercisePRs.find((entry: IExercisePR) => entry.exerciseSlug === exerciseSlug)
    if (!pr?.maxWeight) return NextResponse.json({ error: 'Personal record not found' }, { status: 404 })

    const previous = pr.maxWeight
    const next = {
      weight,
      reps,
      date: previous.date,
      ...(previous.programId ? { programId: previous.programId } : {}),
    }
    pr.maxWeight = next
    pr.maxE1RM = { ...next, e1rm: epley1RM(weight, reps) }
    // If max-reps came from this same recorded set, keep its supporting
    // weight/reps pair consistent with the correction. Otherwise it is an
    // independent record and must remain untouched.
    if (
      pr.maxReps &&
      pr.maxReps.weight === previous.weight &&
      pr.maxReps.reps === previous.reps &&
      new Date(pr.maxReps.date).getTime() === new Date(previous.date).getTime()
    ) {
      pr.maxReps = next
    }

    progress.markModified('exercisePRs')
    await progress.save()
    await bustTilesCache(auth.userId!.toString())
    return NextResponse.json({
      success: true,
      pr: {
        exerciseSlug: pr.exerciseSlug,
        exerciseName: pr.exerciseName,
        weight: pr.maxWeight.weight,
        reps: pr.maxWeight.reps,
        date: pr.maxWeight.date,
      },
    })
  } catch (error) {
    console.error('Error correcting personal record:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/progress/prs?exerciseSlug=... — remove a persisted record. A
// later completed workout can establish a fresh one for the exercise.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
    const exerciseSlug = new URL(request.url).searchParams.get('exerciseSlug')
    if (!validSlug(exerciseSlug)) {
      return NextResponse.json({ error: 'A valid exercise is required' }, { status: 400 })
    }

    await dbConnect()
    const progress = await UserProgress.findOne({ userId: auth.userId })
    if (!progress) return NextResponse.json({ error: 'Personal record not found' }, { status: 404 })
    const before = progress.exercisePRs.length
    progress.exercisePRs = progress.exercisePRs.filter((entry: IExercisePR) => entry.exerciseSlug !== exerciseSlug)
    if (progress.exercisePRs.length === before) {
      return NextResponse.json({ error: 'Personal record not found' }, { status: 404 })
    }
    progress.markModified('exercisePRs')
    await progress.save()
    await bustTilesCache(auth.userId!.toString())
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing personal record:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
