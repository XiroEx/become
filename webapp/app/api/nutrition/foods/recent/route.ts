import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import MealLog from '@/models/MealLog'
import Food, { IFood, IFoodVariant } from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import { baseSlug } from '@/lib/foodSlug'
import type { IMealItem } from '@/models/Meal'

// GET: Get user's recently logged foods (last 14 days, deduped, most recent first)
//
// Pulls from MealLog (the canonical store post-overhaul). For items that still
// resolve to a Food doc, we return the full flattened shape (with variants[]
// for the picker). For items whose foodId is missing or stale, we synthesize a
// single-variant Food-shaped object from the snapshot fields so the picker
// preview doesn't fall to 0.
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const logs = await MealLog.find({
      user: authResult.userId,
      loggedAt: { $gte: fourteenDaysAgo },
    })
      .sort({ loggedAt: -1 })
      .lean<{ items: IMealItem[]; loggedAt: Date }[]>()

    // Dedupe by foodId (or name fallback), keeping the first (most recent) hit.
    const seen = new Map<string, { item: IMealItem; loggedAt: Date }>()
    for (const log of logs) {
      for (const item of log.items ?? []) {
        const key = item.foodId?.toString() || item.name
        if (!seen.has(key)) seen.set(key, { item, loggedAt: log.loggedAt })
      }
    }

    const recent = Array.from(seen.values()).slice(0, 20)

    const foodIds = recent
      .map(r => r.item.foodId?.toString())
      .filter((id): id is string => !!id)
    const foodDocs = foodIds.length > 0
      ? await Food.find({ _id: { $in: foodIds } }).lean<(IFood & { _id: mongoose.Types.ObjectId })[]>()
      : []
    const foodMap = new Map(foodDocs.map(f => [f._id.toString(), f]))

    // For items missing a foodId, see if a Food doc already exists with the
    // matching base slug — that resolves "I favorited this earlier" to the
    // real ObjectId so the row reflects saved state and avoids creating
    // duplicates on subsequent favorites.
    const orphanItems = recent.filter(({ item }) => !item.foodId || !foodMap.has(item.foodId.toString()))
    const slugLookups = Array.from(new Set(
      orphanItems.map(({ item }) => baseSlug(item.name, item.brand))
    ))
    const slugDocs = slugLookups.length > 0
      ? await Food.find({ slug: { $in: slugLookups } }).lean<(IFood & { _id: mongoose.Types.ObjectId })[]>()
      : []
    const slugMap = new Map(slugDocs.map(f => [f.slug, f]))

    const enriched = recent.map(({ item, loggedAt }) => {
      const id = item.foodId?.toString()
      if (id && foodMap.has(id)) {
        return { ...flattenFoodForResponse(foodMap.get(id)!), lastLoggedAt: loggedAt }
      }
      // Try resolving against an existing Food via base slug
      const slug = baseSlug(item.name, item.brand)
      const matched = slugMap.get(slug)
      if (matched) {
        return { ...flattenFoodForResponse(matched), lastLoggedAt: loggedAt }
      }
      // Fallback: synthesize a single-variant Food-shape from the snapshot so
      // the picker preview has the data it needs.
      const variant: IFoodVariant = {
        name: item.variantName || 'Default',
        isDefault: true,
        servingSize: item.servingSize,
        servingUnit: item.servingUnit as IFoodVariant['servingUnit'],
        alternateServings: [],
        nutrition: item.nutrition,
      }
      return {
        _id: id || `legacy-${item.name}`,
        name: item.name,
        brand: item.brand,
        servingSize: item.servingSize,
        servingUnit: item.servingUnit,
        nutrition: item.nutrition,
        alternateServings: [],
        variants: [variant],
        source: 'manual',
        lastLoggedAt: loggedAt,
      }
    })

    return NextResponse.json({ foods: enriched })
  } catch (error) {
    console.error('Error fetching recent foods:', error)
    return NextResponse.json({ error: 'Failed to fetch recent foods' }, { status: 500 })
  }
}
