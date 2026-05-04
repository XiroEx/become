import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import FoodItem from '@/models/FoodItem'
import OpenFoodFact from '@/models/OpenFoodFact'
import { verifyAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Shared mapper — same shape as the foods search endpoint
// ---------------------------------------------------------------------------

function mapOffToFoodResult(off: InstanceType<typeof OpenFoodFact> & { _id: unknown }) {
  const n = off.nutriments

  const nutrition = {
    calories: Math.round(n.energy_kcal_100g) || 0,
    protein:  Math.round((n.proteins_100g      ?? 0) * 10) / 10,
    carbs:    Math.round((n.carbohydrates_100g  ?? 0) * 10) / 10,
    fats:     Math.round((n.fat_100g            ?? 0) * 10) / 10,
    fiber:    n.fiber_100g       != null ? Math.round(n.fiber_100g       * 10) / 10 : undefined,
    sugar:    n.sugars_100g      != null ? Math.round(n.sugars_100g      * 10) / 10 : undefined,
    sodium:   n.sodium_100g      != null ? Math.round(n.sodium_100g      * 1000) / 1000 : undefined,
  }

  const alternateServings: { label: string; multiplier: number }[] = []
  if (off.serving_quantity && off.serving_quantity > 0 && off.serving_quantity !== 100) {
    const label = off.serving_size || `${off.serving_quantity}${off.serving_unit || 'g'}`
    alternateServings.push({ label, multiplier: off.serving_quantity / 100 })
  }

  return {
    _id:              String(off._id),
    name:             off.product_name,
    brand:            off.brands || undefined,
    category:         off.category || 'Other',
    servingSize:      100,
    servingUnit:      'g' as const,
    alternateServings,
    nutrition,
    barcode:          off.code,
    source:           'openfoodfacts' as const,
    image_url:        off.image_url || undefined,
    nutriscore_grade: off.nutriscore_grade || undefined,
  }
}

// ---------------------------------------------------------------------------
// GET /api/nutrition/foods/barcode?code=XXXX
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')?.trim()

    if (!code) {
      return NextResponse.json({ error: 'Missing required parameter: code' }, { status: 400 })
    }

    await dbConnect()

    // 1. Custom FoodItem (user-created or admin-seeded) by barcode field
    const customFood = await FoodItem.findOne({ barcode: code }).lean()
    if (customFood) {
      return NextResponse.json({
        food: { ...customFood, _id: String(customFood._id), source: 'custom' },
      })
    }

    // 2. OpenFoodFacts collection by code field
    const offFood = await OpenFoodFact.findOne({ code }).lean()
    if (offFood) {
      return NextResponse.json({ food: mapOffToFoodResult(offFood as Parameters<typeof mapOffToFoodResult>[0]) })
    }

    // Nothing found
    return NextResponse.json({ food: null })
  } catch (error) {
    console.error('Error looking up barcode:', error)
    return NextResponse.json({ error: 'Failed to look up barcode' }, { status: 500 })
  }
}
