import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import UserProgress, { IWorkoutLog } from '@/models/UserProgress'
import { verifyAdmin } from '@/lib/adminAuth'

// GET /api/admin/users/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 }
      )
    }

    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    await connectDB()

    const user = await User.findById(id).select('-password').lean()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const progress = await UserProgress.findOne(
      { userId: new mongoose.Types.ObjectId(id) },
      {
        weightHistory: { $slice: -10 },
        moodHistory: { $slice: -10 },
        workoutLogs: { $slice: -5 },
        activePrograms: 1,
        streakDays: 1,
        longestStreak: 1,
        totalWorkouts: 1,
        lastActivityDate: 1,
      }
    ).lean()

    // Shape workoutLogs to summary fields only
    const workoutLogsSummary = progress?.workoutLogs?.map((log: IWorkoutLog) => ({
      date: log.date,
      programId: log.programId,
      completed: log.completed,
      duration: log.duration ?? null,
    })) ?? []

    return NextResponse.json({
      user,
      progress: progress
        ? {
            weightHistory: progress.weightHistory ?? [],
            moodHistory: progress.moodHistory ?? [],
            workoutLogs: workoutLogsSummary,
            activePrograms: progress.activePrograms ?? [],
            streakDays: progress.streakDays ?? 0,
            longestStreak: progress.longestStreak ?? 0,
            totalWorkouts: progress.totalWorkouts ?? 0,
            lastActivityDate: progress.lastActivityDate ?? null,
          }
        : null,
    })
  } catch (error) {
    console.error('Admin user detail error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/admin/users/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 }
      )
    }

    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    const body = await request.json() as Record<string, unknown>

    // Build the update payload — only allow specific fields
    const update: Record<string, unknown> = {}

    if (body.role !== undefined) {
      if (!['user', 'trainer', 'admin'].includes(body.role as string)) {
        return NextResponse.json(
          { error: 'Invalid role. Must be user, trainer, or admin' },
          { status: 400 }
        )
      }
      update.role = body.role
    }

    if (body.onboardingCompleted !== undefined) {
      update.onboardingCompleted = Boolean(body.onboardingCompleted)
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
      }
      update.name = body.name.trim()
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    await connectDB()

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .select('-password')
      .lean()

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error('Admin user patch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/users/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 }
      )
    }

    const { id } = await params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    // Prevent self-deletion
    if (adminResult.userId === id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    await connectDB()

    const user = await User.findById(id).lean()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await Promise.all([
      User.findByIdAndDelete(id),
      UserProgress.deleteOne({ userId: new mongoose.Types.ObjectId(id) }),
    ])

    return NextResponse.json({ message: 'User deleted' })
  } catch (error) {
    console.error('Admin user delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
