import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealLog from '@/models/MealLog'
import Meal, { computeTotalNutrition } from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'
import { hasFeature, loadUserEntitlement } from '@/lib/entitlements'
import mongoose from 'mongoose'

/**
 * Combine items that are ALREADY logged into one grouped log, optionally
 * keeping the result as a reusable meal.
 *
 * The multi-select in the search sheet only helps going forward. This is the
 * other half: three items logged separately an hour ago should still be
 * collapsible into "Turkey sandwich" without re-logging them and re-deriving
 * every serving by hand.
 *
 * Ordering is the whole safety story. The merged log is written FIRST, and only
 * then are the picked items stripped from their sources. If the request dies in
 * between, the member sees the items twice — obvious and fixable — instead of
 * losing a log they cannot reconstruct. The reverse order would trade a visible
 * annoyance for silent data loss.
 */

interface Pick {
  logId: string
  itemId: string
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const picks: Pick[] = Array.isArray(body.picks) ? body.picks : []
    if (picks.length < 2) {
      // One item is not a combination; it would just rename a row.
      return NextResponse.json({ error: 'Pick at least two items to combine' }, { status: 400 })
    }
    if (picks.some(p => !mongoose.Types.ObjectId.isValid(String(p?.logId)))) {
      return NextResponse.json({ error: 'Invalid logId' }, { status: 400 })
    }

    const mealName = typeof body.mealName === 'string' ? body.mealName.trim() : ''
    const saveAsMeal = Boolean(body.saveAsMeal)
    if (saveAsMeal && !mealName) {
      return NextResponse.json({ error: 'A meal needs a name' }, { status: 400 })
    }

    await dbConnect()

    // Saving a reusable meal is the gated half; combining the day's rows is not.
    if (saveAsMeal) {
      const { role, tier } = await loadUserEntitlement(auth.userId)
      if (!hasFeature(role, tier, 'custom-meals')) {
        return NextResponse.json(
          { error: 'Saving a meal requires Plus', requiresTier: 'plus' },
          { status: 403 },
        )
      }
    }

    const logIds = [...new Set(picks.map(p => String(p.logId)))]
    const logs = await MealLog.find({ _id: { $in: logIds }, user: auth.userId })
    if (logs.length !== logIds.length) {
      // Either a stale id from the client or someone else's log. Same answer:
      // do not touch anything.
      return NextResponse.json({ error: 'Some logs were not found' }, { status: 404 })
    }

    const byId = new Map(logs.map(l => [String(l._id), l]))

    // Resolve every pick BEFORE writing anything, so a bad id cannot leave a
    // half-built merge behind.
    const picked: { log: (typeof logs)[number]; itemId: string; item: Record<string, unknown> }[] = []
    for (const p of picks) {
      const log = byId.get(String(p.logId))!
      const item = (log.items as unknown as { _id?: unknown }[]).find(
        it => String(it._id) === String(p.itemId),
      )
      if (!item) {
        return NextResponse.json({ error: 'Some items were not found' }, { status: 404 })
      }
      picked.push({ log, itemId: String(p.itemId), item: item as Record<string, unknown> })
    }

    // Strip _id so Mongoose mints fresh subdocument ids on the merged log
    // rather than colliding with the originals we are about to remove.
    const items = picked.map(({ item }) => {
      const plain = typeof (item as { toObject?: () => unknown }).toObject === 'function'
        ? (item as { toObject: () => Record<string, unknown> }).toObject()
        : { ...item }
      delete plain._id
      return plain
    })

    // Keep the earliest source time and the union of tags: the combined entry
    // belongs where the member already put these items, not at "now" — which
    // would jump it to the bottom of the day, or into the wrong day entirely
    // near midnight.
    const sources = [...new Set(picked.map(p => p.log))]
    const loggedAt = sources.reduce(
      (earliest, l) => (l.loggedAt < earliest ? l.loggedAt : earliest),
      sources[0].loggedAt,
    )
    const tags = [...new Set(sources.flatMap(l => l.tags ?? []))]

    let meal: { _id: mongoose.Types.ObjectId } | null = null
    if (saveAsMeal) {
      meal = await Meal.create({
        user: auth.userId,
        name: mealName,
        items,
        totalNutrition: computeTotalNutrition(items as never),
      })
    }

    // 1) Write the merged log.
    const combined = await MealLog.create({
      user: auth.userId,
      loggedAt,
      items,
      tags,
      source: 'manual',
      mealId: meal?._id,
      mealName: mealName || undefined,
      totalNutrition: computeTotalNutrition(items as never),
    })

    // 2) Only now remove what we copied. A log emptied by the move is deleted:
    // an entry with no items renders as a ghost row that cannot be cleaned up.
    const removedLogIds: string[] = []
    for (const log of sources) {
      const takenIds = new Set(
        picked.filter(p => p.log === log).map(p => p.itemId),
      )
      const remaining = (log.items as unknown as { _id?: unknown }[]).filter(
        it => !takenIds.has(String(it._id)),
      )
      if (remaining.length === 0) {
        await MealLog.deleteOne({ _id: log._id, user: auth.userId })
        removedLogIds.push(String(log._id))
        continue
      }
      log.items = remaining as never
      log.totalNutrition = computeTotalNutrition(remaining as never)
      await log.save()
    }

    return NextResponse.json({
      success: true,
      log: combined,
      mealId: meal?._id ?? null,
      removedLogIds,
    }, { status: 201 })
  } catch (error) {
    console.error('Error combining meal logs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to combine' },
      { status: 500 },
    )
  }
}
