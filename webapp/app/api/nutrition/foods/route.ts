import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import FoodItem from '@/models/FoodItem'
import { verifyAuth } from '@/lib/auth'
import type { IOpenFoodFact } from '@/models/OpenFoodFact'

// ---------------------------------------------------------------------------
// Map an OpenFoodFact document to the same shape as a FoodItem
// so the frontend doesn't need changes.
// OFF stores nutrition per 100g — we return it as a "100g" serving by default,
// and include the product's own serving_size as an alternate serving.
// ---------------------------------------------------------------------------

function mapOffToFoodResult(off: IOpenFoodFact & { _id: mongoose.Types.ObjectId }) {
  const n = off.nutriments

  // Base nutrition is per 100g
  const nutrition = {
    calories: Math.round(n.energy_kcal_100g) || 0,
    protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
    fats: Math.round((n.fat_100g ?? 0) * 10) / 10,
    fiber: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : undefined,
    sugar: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : undefined,
    sodium: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) / 1000 : undefined, // g
    saturatedFat: n.saturated_fat_100g != null ? Math.round(n.saturated_fat_100g * 10) / 10 : undefined
  }

  // Build alternate servings
  const alternateServings: { label: string; multiplier: number }[] = []

  if (off.serving_quantity && off.serving_quantity > 0 && off.serving_quantity !== 100) {
    const label = off.serving_size || `${off.serving_quantity}${off.serving_unit || 'g'}`
    alternateServings.push({
      label,
      multiplier: off.serving_quantity / 100
    })
  }

  return {
    _id: off._id,
    name: off.product_name,
    brand: off.brands || undefined,
    category: off.category || 'Other',
    servingSize: 100,
    servingUnit: 'g' as const,
    alternateServings,
    nutrition,
    barcode: off.code,
    isVerified: false,
    usageCount: 0,
    source: 'openfoodfacts' as const,
    image_url: off.image_url || undefined,
    nutriscore_grade: off.nutriscore_grade || undefined
  }
}

// ---------------------------------------------------------------------------
// GET: Search foods — queries both FoodItem (custom) and openfoodfacts
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const category = searchParams.get('category')
    const customOnly = searchParams.get('custom') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Build base filter for FoodItem
    const baseFilter: Record<string, unknown> = {}
    if (category) {
      baseFilter.category = category
    }

    if (!q) {
      // No search query — return popular custom foods only
      const foods = await FoodItem.find(baseFilter)
        .sort({ usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()

      const total = await FoodItem.countDocuments(baseFilter)
      const tagged = foods.map(f => ({ ...f, source: 'custom' }))
      return NextResponse.json({ foods: tagged, total, offset, limit })
    }

    // --- Search custom FoodItem collection ---

    const customLimit = 10

    // Text search for full-word matches
    const textFilter = { ...baseFilter, $text: { $search: q } }
    const textResults = await FoodItem.find(textFilter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
      .limit(customLimit)
      .lean()

    // Regex fallback for partial matches
    const regexFilter = {
      ...baseFilter,
      name: { $regex: q, $options: 'i' }
    }
    const regexResults = await FoodItem.find(regexFilter)
      .sort({ usageCount: -1 })
      .limit(customLimit)
      .lean()

    // Combine and deduplicate custom results
    const seenIds = new Set<string>()
    const customFoods: (Record<string, unknown> & { source: string })[] = []

    for (const item of textResults) {
      const id = item._id.toString()
      if (!seenIds.has(id)) {
        seenIds.add(id)
        customFoods.push({ ...item, source: 'custom' })
      }
    }

    for (const item of regexResults) {
      const id = item._id.toString()
      if (!seenIds.has(id) && customFoods.length < customLimit) {
        seenIds.add(id)
        customFoods.push({ ...item, source: 'custom' })
      }
    }

    // --- Search Open Food Facts collection (unless custom-only) ---

    let offFoods: ReturnType<typeof mapOffToFoodResult>[] = []

    if (!customOnly) {
      const offLimit = 20 - Math.min(customFoods.length, 10)
      const offCollection = mongoose.connection.db!.collection('openfoodfacts')

      // Build OFF filter
      const offFilter: Record<string, unknown> = { $text: { $search: q } }
      if (category) {
        offFilter.category = category
      }

      try {
        const offResults = await offCollection
          .find(offFilter, { projection: { score: { $meta: 'textScore' } } })
          .sort({ score: { $meta: 'textScore' } })
          .limit(offLimit)
          .toArray() as unknown as (IOpenFoodFact & { _id: mongoose.Types.ObjectId })[]

        offFoods = offResults.map(mapOffToFoodResult)
      } catch {
        // OFF collection might not exist yet — fail gracefully
        offFoods = []
      }
    }

    // Combine: custom foods first, then OFF results
    const combined = [...customFoods, ...offFoods]
    const paged = combined.slice(offset, offset + limit)

    return NextResponse.json({ foods: paged, total: combined.length, offset, limit })
  } catch (error) {
    console.error('Error searching foods:', error)
    return NextResponse.json({ error: 'Failed to search foods' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST: Create a custom food item
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.name || !body.category || !body.nutrition) {
      return NextResponse.json({ error: 'Missing required fields: name, category, nutrition' }, { status: 400 })
    }

    await dbConnect()

    const foodItem = await FoodItem.create({
      ...body,
      createdBy: authResult.userId,
      isVerified: false,
      usageCount: 0
    })

    return NextResponse.json({ success: true, food: foodItem }, { status: 201 })
  } catch (error) {
    console.error('Error creating food item:', error)
    return NextResponse.json({ error: 'Failed to create food item' }, { status: 500 })
  }
}
