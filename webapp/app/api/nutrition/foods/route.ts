import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import FoodItem from '@/models/FoodItem'
import { verifyAuth } from '@/lib/auth'
import { searchUSDA } from '@/lib/usda'
import type { IOpenFoodFact } from '@/models/OpenFoodFact'

// ---------------------------------------------------------------------------
// Map an OpenFoodFact document to the same shape as a FoodItem
// ---------------------------------------------------------------------------

function mapOffToFoodResult(off: IOpenFoodFact & { _id: mongoose.Types.ObjectId }) {
  const n = off.nutriments

  const nutrition = {
    calories: Math.round(n.energy_kcal_100g) || 0,
    protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
    fats: Math.round((n.fat_100g ?? 0) * 10) / 10,
    fiber: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : undefined,
    sugar: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : undefined,
    sodium: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) / 1000 : undefined,
    saturatedFat: n.saturated_fat_100g != null ? Math.round(n.saturated_fat_100g * 10) / 10 : undefined
  }

  const alternateServings: { label: string; multiplier: number }[] = []

  if (off.serving_quantity && off.serving_quantity > 0 && off.serving_quantity !== 100) {
    const label = off.serving_size || `${off.serving_quantity}${off.serving_unit || 'g'}`
    alternateServings.push({ label, multiplier: off.serving_quantity / 100 })
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
    source: 'openfoodfacts' as const,
    image_url: off.image_url || undefined,
    nutriscore_grade: off.nutriscore_grade || undefined
  }
}

// ---------------------------------------------------------------------------
// GET: Search foods — custom first, then USDA (primary), OFF (fallback)
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const baseFilter: Record<string, unknown> = {}
    if (category) baseFilter.category = category

    if (!q) {
      const foods = await FoodItem.find(baseFilter)
        .sort({ usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()

      const total = await FoodItem.countDocuments(baseFilter)
      return NextResponse.json({ foods: foods.map(f => ({ ...f, source: 'custom' })), total, offset, limit })
    }

    // --- 1. Custom foods (always first) ---

    const customLimit = 5

    const textFilter = { ...baseFilter, $text: { $search: q } }
    const textResults = await FoodItem.find(textFilter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
      .limit(customLimit)
      .lean()

    const regexFilter = { ...baseFilter, name: { $regex: q, $options: 'i' } }
    const regexResults = await FoodItem.find(regexFilter)
      .sort({ usageCount: -1 })
      .limit(customLimit)
      .lean()

    const seenIds = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customFoods: any[] = []

    for (const item of textResults) {
      const id = item._id.toString()
      if (!seenIds.has(id)) { seenIds.add(id); customFoods.push({ ...item, source: 'custom' }) }
    }
    for (const item of regexResults) {
      const id = item._id.toString()
      if (!seenIds.has(id) && customFoods.length < customLimit) { seenIds.add(id); customFoods.push({ ...item, source: 'custom' }) }
    }

    if (customOnly) {
      return NextResponse.json({ foods: customFoods, total: customFoods.length, offset, limit })
    }

    // --- 2. USDA (primary external source) ---

    const usdaResults = await searchUSDA(q, 15)

    // --- 3. Open Food Facts (supplemental for packaged goods) ---

    let offFoods: ReturnType<typeof mapOffToFoodResult>[] = []
    // Only query OFF if USDA returned few results
    if (usdaResults.length < 10) {
      try {
        const offCollection = mongoose.connection.db!.collection('openfoodfacts')
        const offFilter: Record<string, unknown> = { $text: { $search: q } }
        if (category) offFilter.category = category

        const offResults = await offCollection
          .find(offFilter, { projection: { score: { $meta: 'textScore' } } })
          .sort({ score: { $meta: 'textScore' } })
          .limit(10)
          .toArray() as unknown as (IOpenFoodFact & { _id: mongoose.Types.ObjectId })[]

        offFoods = offResults.map(mapOffToFoodResult)
      } catch {
        // OFF collection might not exist — fail gracefully
      }
    }

    // Combine: custom → USDA → OFF
    const combined = [...customFoods, ...usdaResults, ...offFoods]
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
