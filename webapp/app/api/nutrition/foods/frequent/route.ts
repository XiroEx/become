import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import MealLog from '@/models/MealLog'
import Food, { IFood, IFoodVariant } from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import { baseSlug } from '@/lib/foodSlug'

// GET: Get user's most frequently logged foods (across all MealLogs)
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const userObjId = new mongoose.Types.ObjectId(authResult.userId)
    const pipeline = [
      { $match: { user: userObjId } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { foodId: '$items.foodId', name: '$items.name' },
          count: { $sum: 1 },
          lastNutrition: { $last: '$items.nutrition' },
          lastServingSize: { $last: '$items.servingSize' },
          lastServingUnit: { $last: '$items.servingUnit' },
          lastBrand: { $last: '$items.brand' },
          lastVariantName: { $last: '$items.variantName' },
        },
      },
      { $sort: { count: -1 as const } },
      { $limit: 20 },
    ]

    const results = await MealLog.aggregate(pipeline)

    const foodIds = results
      .map(r => r._id.foodId?.toString())
      .filter((id): id is string => !!id)
    const foodDocs = foodIds.length > 0
      ? await Food.find({ _id: { $in: foodIds } }).lean<(IFood & { _id: mongoose.Types.ObjectId })[]>()
      : []
    const foodMap = new Map(foodDocs.map(f => [f._id.toString(), f]))

    // Resolve orphan log entries (no foodId) to existing Food docs by base
    // slug — covers items the user already favorited, so the row reflects
    // saved state and a re-favorite returns the existing doc instead of
    // creating a duplicate.
    const orphanSlugs = Array.from(new Set(
      results
        .filter(r => !r._id.foodId || !foodMap.has(r._id.foodId.toString()))
        .map(r => baseSlug(r._id.name, r.lastBrand))
    ))
    const slugDocs = orphanSlugs.length > 0
      ? await Food.find({ slug: { $in: orphanSlugs } }).lean<(IFood & { _id: mongoose.Types.ObjectId })[]>()
      : []
    const slugMap = new Map(slugDocs.map(f => [f.slug, f]))

    const foods = results.map(r => {
      const foodId = r._id.foodId?.toString()
      const foodDoc = foodId ? foodMap.get(foodId) : null
      if (foodDoc) {
        return { ...flattenFoodForResponse(foodDoc), count: r.count }
      }
      const slug = baseSlug(r._id.name, r.lastBrand)
      const matched = slugMap.get(slug)
      if (matched) {
        return { ...flattenFoodForResponse(matched), count: r.count }
      }
      // Synthesized fallback so the picker preview computes correctly when the
      // underlying Food no longer exists.
      const variant: IFoodVariant = {
        name: r.lastVariantName || 'Default',
        isDefault: true,
        servingSize: r.lastServingSize,
        servingUnit: r.lastServingUnit as IFoodVariant['servingUnit'],
        alternateServings: [],
        nutrition: r.lastNutrition,
      }
      return {
        _id: foodId || `legacy-${r._id.name}`,
        name: r._id.name,
        brand: r.lastBrand,
        servingSize: r.lastServingSize,
        servingUnit: r.lastServingUnit,
        nutrition: r.lastNutrition,
        alternateServings: [],
        variants: [variant],
        source: 'manual',
        count: r.count,
      }
    })

    return NextResponse.json({ foods })
  } catch (error) {
    console.error('Error fetching frequent foods:', error)
    return NextResponse.json({ error: 'Failed to fetch frequent foods' }, { status: 500 })
  }
}
