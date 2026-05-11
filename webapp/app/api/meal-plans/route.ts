import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import MealPlan, { IMealPlan, MealPlanStatus } from '@/models/MealPlan'
import Meal, { IMealItem } from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'
import { resolveItemsFromInput, MealItemInput } from '@/lib/mealItems'
import {
  addDaysToKey,
  parsePlannedDateToUtcMidnight,
  todayUtcKey,
  compareDateKeys,
} from '@/lib/mealPlanDates'
import {
  createOrMergePlan,
  serializePlan,
  parseMode,
  emptyNutrition,
  addNutrition,
  roundNutrition,
  cloneItemsForSnapshot,
  SerializedPlan,
} from '@/lib/mealPlanShared'

function isObjectIdLike(v: unknown): v is string {
  return typeof v === 'string' && mongoose.Types.ObjectId.isValid(v)
}

// ---------------------------------------------------------------------------
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD[&status=active,promoted]
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const statusParam = searchParams.get('status')

    if (!fromParam || !toParam) {
      return NextResponse.json({ error: 'Provide ?from=YYYY-MM-DD&to=YYYY-MM-DD' }, { status: 400 })
    }

    let start: Date
    let end: Date
    try {
      start = parsePlannedDateToUtcMidnight(fromParam)
      end = parsePlannedDateToUtcMidnight(toParam)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid date' }, { status: 400 })
    }
    const endInclusive = new Date(end.getTime() + 86_400_000 - 1)

    const statuses: MealPlanStatus[] = statusParam
      ? statusParam.split(',').map(s => s.trim()).filter((s): s is MealPlanStatus =>
          s === 'active' || s === 'promoted' || s === 'skipped' || s === 'superseded')
      : ['active', 'promoted']

    const plans = await MealPlan.find({
      user: authResult.userId,
      plannedDate: { $gte: start, $lte: endInclusive },
      status: { $in: statuses },
    }).sort({ plannedDate: 1, createdAt: 1 }).lean<IMealPlan[]>()

    const serializedPlans = plans.map(serializePlan)

    // Group by YYYY-MM-DD (per the plan, server delivers both flat and days[]).
    const byDate = new Map<string, { date: string; plans: SerializedPlan[]; expectedTotals: ReturnType<typeof emptyNutrition> }>()

    let cursorKey = fromParam
    while (compareDateKeys(cursorKey, toParam) <= 0) {
      byDate.set(cursorKey, { date: cursorKey, plans: [], expectedTotals: emptyNutrition() })
      cursorKey = addDaysToKey(cursorKey, 1)
    }

    for (const p of serializedPlans) {
      const key = p.plannedDateKey
      const bucket = byDate.get(key) ?? { date: key, plans: [], expectedTotals: emptyNutrition() }
      bucket.plans.push(p)
      // Only active plans contribute to expectedTotals — promoted plans live
      // in MealLog now and would double-count.
      if (p.status === 'active') {
        addNutrition(bucket.expectedTotals, p.expectedNutrition)
      }
      byDate.set(key, bucket)
    }

    const days = Array.from(byDate.values())
      .sort((a, b) => compareDateKeys(a.date, b.date))
      .map(d => ({ ...d, expectedTotals: roundNutrition(d.expectedTotals) }))

    return NextResponse.json({ plans: serializedPlans, days })
  } catch (error) {
    console.error('Error listing meal plans:', error)
    return NextResponse.json({ error: 'Failed to list meal plans' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST body { plannedDate, tag, items?, mealId?, notes?, mode?, repeat? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json().catch(() => ({}))
    const plannedDate = typeof body.plannedDate === 'string' ? body.plannedDate : null
    const tag = typeof body.tag === 'string' ? body.tag.trim().toLowerCase() : null
    const notes = typeof body.notes === 'string' ? body.notes : undefined
    const mode = parseMode(body.mode)

    if (!plannedDate) {
      return NextResponse.json({ error: 'plannedDate is required (YYYY-MM-DD)' }, { status: 400 })
    }
    if (!tag) {
      return NextResponse.json({ error: 'tag is required' }, { status: 400 })
    }

    try {
      parsePlannedDateToUtcMidnight(plannedDate)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid plannedDate' }, { status: 400 })
    }
    // Past-date rejection per plan §8.6 (24h slop) — reject anything before
    // yesterday-UTC; yesterday is OK to handle TZ edge cases at midnight.
    const todayKey = todayUtcKey()
    const yesterdayKey = addDaysToKey(todayKey, -1)
    if (compareDateKeys(plannedDate, yesterdayKey) < 0) {
      return NextResponse.json({ error: 'plan_past_date' }, { status: 400 })
    }

    let resolvedItems: IMealItem[] = []
    let mealId: mongoose.Types.ObjectId | undefined
    let mealName: string | undefined

    if (isObjectIdLike(body.mealId)) {
      const meal = await Meal.findById(body.mealId).lean()
      if (!meal) {
        return NextResponse.json({ error: 'Meal template not found' }, { status: 404 })
      }
      mealId = meal._id
      mealName = meal.name
      resolvedItems = cloneItemsForSnapshot((meal.items as IMealItem[] | undefined) || [])
    }
    if (Array.isArray(body.items) && body.items.length > 0) {
      const fromBody = await resolveItemsFromInput(body.items as MealItemInput[])
      resolvedItems = mealId ? [...resolvedItems, ...fromBody] : fromBody
    }
    if (resolvedItems.length === 0 && !mealId) {
      return NextResponse.json({ error: 'Provide items[] or mealId' }, { status: 400 })
    }

    // Recurrence — expand on create per Section 7.
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

    if (repeat) {
      const step = repeat.every === 'day' ? 1 : 7
      const seriesId = new mongoose.Types.ObjectId()
      const targetKeys: string[] = []
      for (let i = 0; i < repeat.count; i++) {
        const key = addDaysToKey(plannedDate, i * step)
        if (repeat.skipDates.includes(key)) continue
        if (compareDateKeys(key, yesterdayKey) < 0) continue
        targetKeys.push(key)
      }

      const results = await Promise.allSettled(targetKeys.map(key => createOrMergePlan({
        userId: authResult.userId!,
        plannedDateKey: key,
        tag,
        items: resolvedItems,
        mealId,
        mealName,
        notes,
        seriesId,
        mode,
      })))

      const created: SerializedPlan[] = []
      const merged: SerializedPlan[] = []
      const replaced: SerializedPlan[] = []
      const conflicts: SerializedPlan[] = []
      const errors: string[] = []
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.outcome === 'created') created.push(r.value.plan)
          else if (r.value.outcome === 'merged') merged.push(r.value.plan)
          else if (r.value.outcome === 'replaced') replaced.push(r.value.plan)
          else if (r.value.outcome === 'conflict' && r.value.existingPlan) conflicts.push(r.value.existingPlan)
        } else {
          errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
        }
      }
      return NextResponse.json({
        seriesId: String(seriesId),
        created: created.length,
        merged: merged.length,
        replaced: replaced.length,
        conflicts,
        plans: [...created, ...merged, ...replaced],
        errors: errors.length ? errors : undefined,
      }, { status: 201 })
    }

    const result = await createOrMergePlan({
      userId: authResult.userId!,
      plannedDateKey: plannedDate,
      tag,
      items: resolvedItems,
      mealId,
      mealName,
      notes,
      mode,
    })

    if (result.outcome === 'conflict') {
      return NextResponse.json({ error: 'plan_exists', existingPlan: result.existingPlan }, { status: 409 })
    }
    if (result.outcome === 'merged') {
      return NextResponse.json({ plan: result.plan, merged: true }, { status: 200 })
    }
    if (result.outcome === 'replaced') {
      return NextResponse.json({ plan: result.plan, replaced: true }, { status: 200 })
    }
    return NextResponse.json({ plan: result.plan }, { status: 201 })
  } catch (error) {
    console.error('Error creating meal plan:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create meal plan' }, { status: 500 })
  }
}
