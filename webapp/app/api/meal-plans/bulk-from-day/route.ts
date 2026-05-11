import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealPlan, { IMealPlan } from '@/models/MealPlan'
import MealLog, { IMealLog } from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'
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

// POST /api/meal-plans/bulk-from-day
// Body:
//   sourceDate: YYYY-MM-DD
//   sourceType: 'log' | 'plan'
//   targetDates: YYYY-MM-DD[]
//   mode?: 'merge' | 'replace' | 'fail'  — default 'merge'
//   tagPolicy?: 'preserve' | 'remap-by-time'  — only 'preserve' supported in v1
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()

    const body = await request.json().catch(() => ({}))
    const sourceDate = typeof body.sourceDate === 'string' ? body.sourceDate : null
    const sourceType = body.sourceType === 'log' || body.sourceType === 'plan' ? body.sourceType : null
    const targetDates: unknown = body.targetDates
    const mode = parseMode(body.mode)

    if (!sourceDate || !sourceType) {
      return NextResponse.json({ error: 'sourceDate and sourceType are required' }, { status: 400 })
    }
    if (!Array.isArray(targetDates) || targetDates.length === 0) {
      return NextResponse.json({ error: 'targetDates must be a non-empty array' }, { status: 400 })
    }

    // Validate every date string up front.
    let sourceDateObj: Date
    try {
      sourceDateObj = parsePlannedDateToUtcMidnight(sourceDate)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid sourceDate' }, { status: 400 })
    }
    const targets: string[] = []
    for (const t of targetDates) {
      if (typeof t !== 'string') {
        return NextResponse.json({ error: 'targetDates must be YYYY-MM-DD strings' }, { status: 400 })
      }
      try {
        parsePlannedDateToUtcMidnight(t)
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : `Invalid date: ${t}` }, { status: 400 })
      }
      targets.push(t)
    }

    // Past-date rejection on targets (same 24h slop as POST /api/meal-plans).
    const yesterdayKey = addDaysToKey(todayUtcKey(), -1)
    const acceptableTargets: string[] = []
    const skippedPast: string[] = []
    for (const t of targets) {
      if (compareDateKeys(t, yesterdayKey) < 0) skippedPast.push(t)
      else acceptableTargets.push(t)
    }

    // Read the source: either a day of MealLogs or a day of active MealPlans.
    interface SourceRow {
      tag: string
      items: IMealLog['items'] | IMealPlan['items']
      mealId?: IMealLog['mealId']
      mealName?: string
      notes?: string
    }
    const sourceRows: SourceRow[] = []
    if (sourceType === 'log') {
      const start = sourceDateObj
      const end = new Date(start.getTime() + 86_400_000 - 1)
      const logs = await MealLog.find({
        user: authResult.userId,
        loggedAt: { $gte: start, $lte: end },
      }).sort({ loggedAt: 1 }).lean<IMealLog[]>()
      for (const log of logs) {
        const tag = (log.tags && log.tags.length > 0 ? log.tags[0] : 'snack').toLowerCase()
        sourceRows.push({
          tag,
          items: log.items,
          mealId: log.mealId,
          mealName: log.mealName,
          notes: log.notes,
        })
      }
    } else {
      const plans = await MealPlan.find({
        user: authResult.userId,
        plannedDate: sourceDateObj,
        status: 'active',
      }).sort({ createdAt: 1 }).lean<IMealPlan[]>()
      for (const plan of plans) {
        sourceRows.push({
          tag: plan.tag,
          items: plan.items,
          mealId: plan.mealId,
          mealName: plan.mealName,
          notes: plan.notes,
        })
      }
    }

    if (sourceRows.length === 0) {
      return NextResponse.json({
        created: 0, merged: 0, replaced: 0,
        conflicts: [],
        plans: [],
        skippedPast,
        message: 'No source rows on the given date',
      }, { status: 200 })
    }

    const created: SerializedPlan[] = []
    const merged: SerializedPlan[] = []
    const replaced: SerializedPlan[] = []
    const conflicts: SerializedPlan[] = []

    for (const target of acceptableTargets) {
      for (const row of sourceRows) {
        const result = await createOrMergePlan({
          userId: authResult.userId!,
          plannedDateKey: target,
          tag: row.tag,
          items: cloneItemsForSnapshot(row.items),
          mealId: row.mealId,
          mealName: row.mealName,
          notes: row.notes,
          mode,
        })
        if (result.outcome === 'created') created.push(result.plan)
        else if (result.outcome === 'merged') merged.push(result.plan)
        else if (result.outcome === 'replaced') replaced.push(result.plan)
        else if (result.outcome === 'conflict' && result.existingPlan) conflicts.push(result.existingPlan)
      }
    }

    return NextResponse.json({
      created: created.length,
      merged: merged.length,
      replaced: replaced.length,
      conflicts,
      plans: [...created, ...merged, ...replaced],
      skippedPast,
    }, { status: 201 })
  } catch (error) {
    console.error('Error in bulk-from-day:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed bulk-from-day' }, { status: 500 })
  }
}
