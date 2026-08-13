import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { verifyAuth } from '@/lib/auth'
import MealLog from '@/models/MealLog'
import Food from '@/models/Food'
import Meal from '@/models/Meal'
import User from '@/models/User'
import mongoose from 'mongoose'

/**
 * The four short lists behind the empty search box.
 *
 * Opening the sheet used to dump the member's entire saved-foods list under a
 * "FOODS" banner — which was byte-for-byte the Foods filter, minus the banner.
 * Two views, one result set, and three of the four filter chips unexplained
 * until you tapped them.
 *
 * This returns a preview of each chip instead: five foods, five meals, five
 * recent, five frequent. The chips then read as "show me more of that" rather
 * than as a mystery.
 *
 * Foods and Meals are ordered by what was LOGGED most recently, not by when they
 * were saved or how often they have been used. Saved-order answers "what did I
 * bookmark last", which is rarely what someone opening a food search wants; the
 * thing they ate this morning is.
 */

const PER_SECTION = 5
/** How far back to look for the recency ordering. */
const RECENCY_WINDOW_DAYS = 90

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const since = new Date()
    since.setDate(since.getDate() - RECENCY_WINDOW_DAYS)

    // One pass over the member's logs serves every section below: the recency
    // ordering for foods and meals, and the recent list itself.
    const logs = await MealLog.find({ user: auth.userId, loggedAt: { $gte: since } })
      .sort({ loggedAt: -1 })
      .select('items loggedAt mealId')
      .lean<{ items: Array<Record<string, unknown>>; loggedAt: Date; mealId?: unknown }[]>()

    /** foodId -> when it was last logged. */
    const lastLoggedFood = new Map<string, number>()
    /** mealId -> when it was last logged. */
    const lastLoggedMeal = new Map<string, number>()
    /** Most recent distinct item, in log order. */
    const recentItems: { item: Record<string, unknown>; loggedAt: Date }[] = []
    const seenRecent = new Set<string>()

    for (const log of logs) {
      const at = new Date(log.loggedAt).getTime()
      if (log.mealId) {
        const k = String(log.mealId)
        if (!lastLoggedMeal.has(k)) lastLoggedMeal.set(k, at)
      }
      for (const item of log.items ?? []) {
        const fid = item.foodId ? String(item.foodId) : null
        if (fid && !lastLoggedFood.has(fid)) lastLoggedFood.set(fid, at)

        const key = fid || String(item.name ?? '')
        if (key && !seenRecent.has(key)) {
          seenRecent.add(key)
          if (recentItems.length < PER_SECTION) recentItems.push({ item, loggedAt: log.loggedAt })
        }
      }
    }

    // ── Foods: the member's saved foods, most recently LOGGED first ──────────
    const user = await User.findById(auth.userId)
      .select('savedFoods')
      .lean<{ savedFoods?: { foodId: mongoose.Types.ObjectId; savedAt?: Date }[] } | null>()

    const savedIds = (user?.savedFoods ?? [])
      .map(s => String(s.foodId))
      .filter(id => mongoose.Types.ObjectId.isValid(id))

    const savedDocs = savedIds.length
      ? await Food.find({ _id: { $in: savedIds } }).lean<Array<Record<string, unknown>>>()
      : []

    const savedAtById = new Map(
      (user?.savedFoods ?? []).map(s => [String(s.foodId), s.savedAt ? new Date(s.savedAt).getTime() : 0]),
    )

    const foods = savedDocs
      .sort((a, b) => {
        const ka = String(a._id), kb = String(b._id)
        // Logged recency wins. A saved food never logged falls back to when it
        // was saved, so the list stays stable rather than arbitrary.
        const la = lastLoggedFood.get(ka) ?? 0
        const lb = lastLoggedFood.get(kb) ?? 0
        if (la !== lb) return lb - la
        return (savedAtById.get(kb) ?? 0) - (savedAtById.get(ka) ?? 0)
      })
      .slice(0, PER_SECTION)
      .map(f => ({ ...f, isSaved: true }))

    // ── Meals: same ordering rule ────────────────────────────────────────────
    const mealDocs = await Meal.find({ user: auth.userId })
      .lean<Array<Record<string, unknown>>>()

    const meals = mealDocs
      .sort((a, b) => {
        const la = lastLoggedMeal.get(String(a._id)) ?? 0
        const lb = lastLoggedMeal.get(String(b._id)) ?? 0
        if (la !== lb) return lb - la
        return ((b.usageCount as number) ?? 0) - ((a.usageCount as number) ?? 0)
      })
      .slice(0, PER_SECTION)

    // ── Recent: distinct items in log order, resolved to their Food docs ─────
    const recentFoodIds = recentItems
      .map(r => (r.item.foodId ? String(r.item.foodId) : null))
      .filter((id): id is string => !!id && mongoose.Types.ObjectId.isValid(id))
    const recentDocs = recentFoodIds.length
      ? await Food.find({ _id: { $in: recentFoodIds } }).lean<Array<Record<string, unknown>>>()
      : []
    const recentById = new Map(recentDocs.map(f => [String(f._id), f]))

    const recent = recentItems.map(({ item }) => {
      const id = item.foodId ? String(item.foodId) : null
      const doc = id ? recentById.get(id) : null
      if (doc) return doc
      // Logged without a Food behind it (a quick-add or a photo estimate). Keep
      // the row rather than dropping it — it is still the thing they ate.
      return {
        _id: id || `legacy-${String(item.name ?? '')}`,
        name: item.name,
        brand: item.brand,
        servingSize: item.servingSize,
        servingUnit: item.servingUnit,
        nutrition: item.nutrition,
        variants: [{
          isDefault: true,
          name: 'Serving',
          displayLabel: item.servingLabel ?? undefined,
          servingSize: item.servingSize,
          servingUnit: item.servingUnit,
          nutrition: item.nutrition,
        }],
      }
    })

    // ── Frequent: most-logged foods in the window ────────────────────────────
    const counts = new Map<string, number>()
    for (const log of logs) {
      for (const item of log.items ?? []) {
        if (!item.foodId) continue
        const k = String(item.foodId)
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
    const frequentIds = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, PER_SECTION)
      .map(([id]) => id)
      .filter(id => mongoose.Types.ObjectId.isValid(id))

    const frequentDocs = frequentIds.length
      ? await Food.find({ _id: { $in: frequentIds } }).lean<Array<Record<string, unknown>>>()
      : []
    // Preserve the count order that the $in query does not.
    const frequent = frequentIds
      .map(id => frequentDocs.find(f => String(f._id) === id))
      .filter(Boolean)

    return NextResponse.json({ foods, meals, recent, frequent })
  } catch (error) {
    console.error('GET /api/nutrition/foods/overview error:', error)
    return NextResponse.json({ error: 'Failed to load overview' }, { status: 500 })
  }
}
