// GET /api/admin/exercises/review — the "Submit to Universal" queue.
// Lists every custom exercise awaiting admin approval, oldest submission
// first, with the submitting user's name/email attached so an admin isn't
// reviewing a bare userId.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import User from '@/models/User'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  await connectDB()

  const exercises = await Exercise.find(
    { isCustom: true, reviewStatus: 'pending' },
    { slug: 1, name: 1, trackingType: 1, primaryMuscles: 1, bodyRegion: 1, category: 1,
      role: 1, defaultSets: 1, defaultReps: 1, tags: 1, videoUrl: 1, thumbnailUrl: 1,
      videoWidth: 1, videoHeight: 1, videoFraming: 1, videoTrim: 1, createdBy: 1,
      submittedAt: 1, createdAt: 1 }
  ).sort({ submittedAt: 1 }).lean()

  const creatorIds = [...new Set(exercises.map((e) => e.createdBy).filter(Boolean))] as string[]
  const users = creatorIds.length
    ? await User.find({ _id: { $in: creatorIds } }, { name: 1, email: 1 }).lean()
    : []
  const userMap = new Map(users.map((u) => [u._id.toString(), u]))

  const submissions = exercises.map((e) => ({
    ...e,
    submittedBy: e.createdBy
      ? {
          name: userMap.get(e.createdBy)?.name ?? null,
          email: userMap.get(e.createdBy)?.email ?? null,
        }
      : null,
  }))

  return NextResponse.json({ submissions })
}
