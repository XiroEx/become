// POST /api/admin/exercises/review/[slug] — approve or reject a pending
// "Submit to Universal" request. Body: { action: 'approve' | 'reject', note?: string }.
//
// Approve is the only thing that flips isUniversal true — that's the single
// field every catalog read checks (lib/exerciseVisibility.ts). Reject just
// records the decision so the owner can see why and edit/resubmit.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const { slug } = await params
  const body = await request.json().catch(() => ({}))
  const action = body?.action
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  await connectDB()
  const exercise = await Exercise.findOne({ slug, isCustom: true })
  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
  }
  if (exercise.reviewStatus !== 'pending') {
    return NextResponse.json({ error: 'This submission is not pending review' }, { status: 409 })
  }

  exercise.isUniversal = action === 'approve'
  exercise.reviewStatus = action === 'approve' ? 'approved' : 'rejected'
  exercise.reviewedBy = gate.userId
  exercise.reviewedAt = new Date()
  exercise.reviewNote = note

  await exercise.save()
  invalidateExerciseCache()

  return NextResponse.json({
    exercise: {
      slug: exercise.slug,
      isUniversal: exercise.isUniversal,
      reviewStatus: exercise.reviewStatus,
      reviewedBy: exercise.reviewedBy,
      reviewedAt: exercise.reviewedAt,
      reviewNote: exercise.reviewNote,
    },
  })
}
