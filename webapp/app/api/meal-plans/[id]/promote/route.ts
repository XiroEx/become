import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import MealPlan from '@/models/MealPlan'
import MealLog from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'
import { defaultTimeForTag } from '@/lib/mealPlanTimes'
import { serializePlan, cloneItemsForSnapshot } from '@/lib/mealPlanShared'

function isObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id)
}

// POST /api/meal-plans/[id]/promote
// Body (optional):
//   loggedAt?: string — ISO. Defaults to "now" when not provided.
//   tags?: string[]   — defaults to [plan.tag].
//
// Atomic flip: findOneAndUpdate(status=active → promoted) gates against
// double-promote even under concurrent requests. The MealLog is then
// created using the snapshot we read alongside the update.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    const { id } = await params
    if (!isObjectId(id)) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const tagsInput: string[] = Array.isArray(body.tags)
      ? body.tags.filter((t: unknown): t is string => typeof t === 'string')
      : []

    // Resolve loggedAt:
    // 1. body.loggedAt wins
    // 2. otherwise, use "now"
    // The client decides today-ness (Section 8.3); server just stores it.
    let loggedAt: Date
    if (typeof body.loggedAt === 'string') {
      loggedAt = new Date(body.loggedAt)
      if (Number.isNaN(loggedAt.getTime())) {
        return NextResponse.json({ error: 'Invalid loggedAt' }, { status: 400 })
      }
    } else {
      loggedAt = new Date()
    }

    // Snapshot the plan first (to read fields) then atomically flip status.
    // findOneAndUpdate with status:'active' filter is the gate — if another
    // request already flipped it, this returns null and we 409.
    const planBefore = await MealPlan.findOne({ _id: id, user: authResult.userId })
    if (!planBefore) {
      return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
    }
    if (planBefore.status !== 'active') {
      return NextResponse.json({
        error: 'plan_not_active',
        status: planBefore.status,
        logId: planBefore.logId ? String(planBefore.logId) : null,
      }, { status: 409 })
    }

    // If no explicit loggedAt and the plan is for a past calendar date,
    // construct loggedAt = combineLocalMidnight(plannedDate, defaultTimeForTag(tag)).
    // (Section 6.4: back-promote uses default tag time.)
    if (!body.loggedAt) {
      const plannedKey = planBefore.plannedDate instanceof Date
        ? planBefore.plannedDate.toISOString().split('T')[0]
        : new Date(planBefore.plannedDate).toISOString().split('T')[0]
      const nowKey = new Date().toISOString().split('T')[0]
      if (plannedKey < nowKey) {
        const [hh, mm] = defaultTimeForTag(planBefore.tag)
        const [y, m, d] = plannedKey.split('-').map(Number)
        // Build as server-local time. The deployed server runs UTC so this
        // yields plannedDate at HH:MM UTC — close enough for back-promotion
        // semantics; the client can override with explicit loggedAt to be
        // exact about local time.
        loggedAt = new Date(y, m - 1, d, hh, mm, 0)
        if (Number.isNaN(loggedAt.getTime())) loggedAt = new Date()
      }
    }

    // Create the MealLog with cloned items (fresh _ids).
    const tagsToWrite = tagsInput.length > 0 ? tagsInput : [planBefore.tag]
    const log = await MealLog.create({
      user: authResult.userId,
      loggedAt,
      items: cloneItemsForSnapshot(planBefore.items),
      mealId: planBefore.mealId,
      mealName: planBefore.mealName,
      tags: tagsToWrite,
      notes: planBefore.notes,
      fromPlanId: planBefore._id,
    })

    // Atomic flip — only succeed if still active. If a competing request
    // beat us, delete the log we just created and 409 the caller.
    const flipped = await MealPlan.findOneAndUpdate(
      { _id: id, user: authResult.userId, status: 'active' },
      { $set: { status: 'promoted', logId: log._id, promotedAt: new Date() } },
      { new: true },
    )
    if (!flipped) {
      // Race lost — rollback the log we created.
      await MealLog.deleteOne({ _id: log._id }).catch(() => null)
      const current = await MealPlan.findById(id).lean()
      return NextResponse.json({
        error: 'plan_not_active',
        status: current?.status ?? 'unknown',
        logId: current?.logId ? String(current.logId) : null,
      }, { status: 409 })
    }

    // Fire streaks like the existing log endpoint.
    const streakResult = await recordStreakActivity(authResult.userId!, authResult.email).catch(() => null)

    // Increment Meal usageCount if this plan was based on a Meal template.
    if (flipped.mealId) {
      const Meal = (await import('@/models/Meal')).default
      await Meal.updateOne({ _id: flipped.mealId }, { $inc: { usageCount: 1 } }).catch(() => null)
    }

    return NextResponse.json({
      success: true,
      log,
      plan: serializePlan(flipped.toObject()),
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          newMilestone: streakResult.newMilestone,
        },
      }),
    })
  } catch (error) {
    console.error('Error promoting meal plan:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to promote meal plan' }, { status: 500 })
  }
}
