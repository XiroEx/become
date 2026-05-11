import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealLog from '@/models/MealLog'
import MealPlan from '@/models/MealPlan'
import { verifyAuth } from '@/lib/auth'
import { resolveItemsFromInput, MealItemInput } from '@/lib/mealItems'

// GET: single log
export async function GET(
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
    const log = await MealLog.findById(id).lean()
    if (!log) {
      return NextResponse.json({ error: 'Meal log not found' }, { status: 404 })
    }
    if (log.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Meal log not found' }, { status: 404 })
    }

    return NextResponse.json({ log })
  } catch (error) {
    console.error('Error fetching meal log:', error)
    return NextResponse.json({ error: 'Failed to fetch meal log' }, { status: 500 })
  }
}

// PATCH: update items / tags / notes / loggedAt (owner only)
export async function PATCH(
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
    const log = await MealLog.findById(id)
    if (!log) {
      return NextResponse.json({ error: 'Meal log not found' }, { status: 404 })
    }
    if (log.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()

    if (Array.isArray(body.items)) {
      const items = await resolveItemsFromInput(body.items as MealItemInput[])
      log.items = items
    }
    if (Array.isArray(body.tags)) log.tags = body.tags
    if (body.notes !== undefined) log.notes = body.notes
    if (body.loggedAt) {
      const next = new Date(body.loggedAt)
      if (Number.isNaN(next.getTime())) {
        return NextResponse.json({ error: 'Invalid loggedAt' }, { status: 400 })
      }
      log.loggedAt = next
    }

    await log.save()

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error updating meal log:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update meal log' }, { status: 500 })
  }
}

// DELETE: owner only
export async function DELETE(
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
    const log = await MealLog.findById(id)
    if (!log) {
      return NextResponse.json({ error: 'Meal log not found' }, { status: 404 })
    }
    if (log.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const sourcePlanId = log.fromPlanId
    await MealLog.deleteOne({ _id: id })

    // Plan §9.1: if this log was promoted from a plan, flip the plan back to
    // 'active' so the user can re-log it. Match status='promoted' to avoid
    // resurrecting a plan the user has since skipped/superseded.
    if (sourcePlanId) {
      await MealPlan.findOneAndUpdate(
        { _id: sourcePlanId, user: authResult.userId, status: 'promoted' },
        { $set: { status: 'active' }, $unset: { logId: '', promotedAt: '' } },
      ).catch(() => null)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting meal log:', error)
    return NextResponse.json({ error: 'Failed to delete meal log' }, { status: 500 })
  }
}
