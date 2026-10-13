import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Meal, { IMealItem } from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'
import { isVerifiedAdmin } from '@/lib/adminAuth'
import {
  parsePlannedDateToUtcMidnight,
  todayUtcKey,
  addDaysToKey,
  compareDateKeys,
} from '@/lib/mealPlanDates'
import {
  createOrMergePlan,
  parseMode,
  cloneItemsForSnapshot,
  SerializedPlan,
} from '@/lib/mealPlanShared'

// POST /api/meal-plans/bulk-from-meal
// Body:
//   mealId: string
//   targetDates: YYYY-MM-DD[]
//   tag: string
//   notes?: string
//   mode?: 'merge' | 'replace' | 'fail'  — default 'merge'
//   repeat?: { every: 'day' | 'week', count: number, skipDates?: string[] }
//      — when provided, expands each target date into a recurring series
//        rooted at that date. Useful for "apply Avocado Toast every Monday
//        for 6 weeks". Per plan §13 Q5 (closed by run 2).
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()

    const body = await request.json().catch(() => ({}))
    const mealId = typeof body.mealId === 'string' ? body.mealId : null
    const tag = typeof body.tag === 'string' ? body.tag.trim().toLowerCase() : null
    const notes = typeof body.notes === 'string' ? body.notes : undefined
    const mode = parseMode(body.mode)
    const targetDates: unknown = body.targetDates

    if (!mealId || !mongoose.Types.ObjectId.isValid(mealId)) {
      return NextResponse.json({ error: 'mealId is required' }, { status: 400 })
    }
    if (!tag) {
      return NextResponse.json({ error: 'tag is required' }, { status: 400 })
    }
    if (!Array.isArray(targetDates) || targetDates.length === 0) {
      return NextResponse.json({ error: 'targetDates must be a non-empty array' }, { status: 400 })
    }

    const targetKeys: string[] = []
    for (const t of targetDates) {
      if (typeof t !== 'string') {
        return NextResponse.json({ error: 'targetDates must be YYYY-MM-DD strings' }, { status: 400 })
      }
      try {
        parsePlannedDateToUtcMidnight(t)
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : `Invalid date: ${t}` }, { status: 400 })
      }
      targetKeys.push(t)
    }

    // Recurrence — expand each target by repeat.count steps.
    const repeatRaw = body.repeat
    let repeat: { every: 'day' | 'week'; count: number; skipDates: string[] } | null = null
    if (repeatRaw && typeof repeatRaw === 'object') {
      const every = repeatRaw.every
      const count = Number(repeatRaw.count)
      if (every !== 'day' && every !== 'week') {
        return NextResponse.json({ error: 'repeat.every must be day or week' }, { status: 400 })
      }
      const max = every === 'day' ? 30 : 52
      if (!Number.isFinite(count) || count < 1 || count > max) {
        return NextResponse.json({ error: `repeat.count must be between 1 and ${max}` }, { status: 400 })
      }
      const skipDates = Array.isArray(repeatRaw.skipDates)
        ? repeatRaw.skipDates.filter((s: unknown): s is string => typeof s === 'string')
        : []
      repeat = { every, count, skipDates }
    }

    const meal = await Meal.findById(mealId).lean()
    if (!meal) {
      return NextResponse.json({ error: 'Meal template not found' }, { status: 404 })
    }
    // Access policy mirrors /api/meals/[id]/log: public/verified/owner/admin.
    const isOwner = meal.createdBy?.toString() === authResult.userId
    // Same admin-only widening as /api/meals/[id]/log, and confirmed the same
    // way — against the database, never off the token claim.
    const isAdmin = isOwner ? false : await isVerifiedAdmin(authResult)
    if (!meal.isPublic && !meal.isVerified && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Meal template not found' }, { status: 404 })
    }

    const items: IMealItem[] = cloneItemsForSnapshot((meal.items as IMealItem[] | undefined) || [])
    if (items.length === 0) {
      return NextResponse.json({ error: 'Meal template has no items' }, { status: 400 })
    }

    const yesterdayKey = addDaysToKey(todayUtcKey(), -1)

    // Expand: for each target date, optionally generate N stepped dates.
    let expandedKeys: string[] = []
    let seriesId: mongoose.Types.ObjectId | undefined
    if (repeat) {
      seriesId = new mongoose.Types.ObjectId()
      const step = repeat.every === 'day' ? 1 : 7
      for (const root of targetKeys) {
        for (let i = 0; i < repeat.count; i++) {
          const key = addDaysToKey(root, i * step)
          if (repeat.skipDates.includes(key)) continue
          expandedKeys.push(key)
        }
      }
    } else {
      expandedKeys = [...targetKeys]
    }

    const skippedPast: string[] = []
    const filteredKeys: string[] = []
    for (const k of expandedKeys) {
      if (compareDateKeys(k, yesterdayKey) < 0) skippedPast.push(k)
      else filteredKeys.push(k)
    }

    const created: SerializedPlan[] = []
    const merged: SerializedPlan[] = []
    const replaced: SerializedPlan[] = []
    const conflicts: SerializedPlan[] = []

    for (const key of filteredKeys) {
      const result = await createOrMergePlan({
        userId: authResult.userId!,
        plannedDateKey: key,
        tag,
        items,
        mealId: meal._id,
        mealName: meal.name,
        notes,
        seriesId,
        mode,
      })
      if (result.outcome === 'created') created.push(result.plan)
      else if (result.outcome === 'merged') merged.push(result.plan)
      else if (result.outcome === 'replaced') replaced.push(result.plan)
      else if (result.outcome === 'conflict' && result.existingPlan) conflicts.push(result.existingPlan)
    }

    return NextResponse.json({
      seriesId: seriesId ? String(seriesId) : undefined,
      created: created.length,
      merged: merged.length,
      replaced: replaced.length,
      conflicts,
      plans: [...created, ...merged, ...replaced],
      skippedPast,
    }, { status: 201 })
  } catch (error) {
    console.error('Error in bulk-from-meal:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed bulk-from-meal' }, { status: 500 })
  }
}
