// ---------------------------------------------------------------------------
// POST   /api/exercises/custom/[slug]/submit — ask admins to publish this
//                                              custom exercise as universal
// DELETE /api/exercises/custom/[slug]/submit — withdraw a pending submission
//
// Submitting does not itself grant visibility — it only moves the exercise
// into the admin review queue (reviewStatus: 'pending'). Visibility flips on
// only when an admin approves it (see /api/admin/exercises/review/[slug]),
// which sets isUniversal: true. That's the field every catalog read
// actually checks (lib/exerciseVisibility.ts).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import { requireFeature } from '@/lib/entitlements'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireFeature(request, 'custom-exercises')
  if (!gate.ok) return gate.response

  const { slug } = await params

  await connectDB()
  const exercise = await Exercise.findOne({
    slug,
    isCustom: true,
    createdBy: gate.userId.toString(),
  })
  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
  }

  if (exercise.reviewStatus === 'pending') {
    return NextResponse.json({ error: 'Already submitted — waiting on admin review' }, { status: 409 })
  }
  if (exercise.isUniversal) {
    return NextResponse.json({ error: 'Already approved and visible to everyone' }, { status: 409 })
  }

  exercise.reviewStatus = 'pending'
  exercise.submittedAt = new Date()
  exercise.reviewNote = null
  await exercise.save()

  return NextResponse.json({
    reviewStatus: exercise.reviewStatus,
    submittedAt: exercise.submittedAt,
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireFeature(request, 'custom-exercises')
  if (!gate.ok) return gate.response

  const { slug } = await params

  await connectDB()
  const exercise = await Exercise.findOne({
    slug,
    isCustom: true,
    createdBy: gate.userId.toString(),
  })
  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
  }

  if (exercise.reviewStatus !== 'pending') {
    return NextResponse.json({ error: 'Nothing pending to withdraw' }, { status: 409 })
  }

  exercise.reviewStatus = 'none'
  exercise.submittedAt = null
  await exercise.save()

  return NextResponse.json({ reviewStatus: exercise.reviewStatus })
}
