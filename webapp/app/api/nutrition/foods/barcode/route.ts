import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Food from '@/models/Food'
import OpenFoodFact from '@/models/OpenFoodFact'
import { verifyAuth } from '@/lib/auth'
import { lookupUSDAByBarcode } from '@/lib/usda'
import { flattenFoodForResponse } from '@/lib/foodImport'

// ---------------------------------------------------------------------------
// Map an OFF doc to the response shape
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
    _id:              `off-${off.code}`,
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

    // Build candidate codes to try.
    // UPC-A (12 digits) and EAN-13 (13 digits with leading zero) are the same
    // barcode in different representations.
    const candidates = new Set<string>([code])
    if (/^\d{12}$/.test(code)) {
      candidates.add('0' + code)           // UPC-A → EAN-13
    } else if (/^\d{13}$/.test(code) && code.startsWith('0')) {
      candidates.add(code.slice(1))        // EAN-13 → UPC-A
    }

    // 1. Our DB (Food) by barcode field
    const localFood = await Food.findOne({ barcode: { $in: [...candidates] } }).lean<(import('@/models/Food').IFood & { _id: import('mongoose').Types.ObjectId }) | null>()
    if (localFood) {
      return NextResponse.json({
        food: { ...flattenFoodForResponse(localFood), source: localFood.source || 'manual' },
      })
    }

    // 2. OpenFoodFacts local collection — try all candidate codes
    const offFood = await OpenFoodFact.findOne({ code: { $in: [...candidates] } }).lean()
    if (offFood) {
      return NextResponse.json({ food: mapOffToFoodResult(offFood as Parameters<typeof mapOffToFoodResult>[0]) })
    }

    // 3. USDA FoodData Central — searches by UPC among Branded foods
    const usdaFood = await lookupUSDAByBarcode(code)
    if (usdaFood) {
      return NextResponse.json({ food: usdaFood })
    }

    // 4. Live OpenFoodFacts API — catches anything not in the local snapshot
    for (const candidate of candidates) {
      try {
        const offRes = await fetch(
          `https://world.openfoodfacts.org/api/v0/product/${candidate}.json`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (offRes.ok) {
          const offData = await offRes.json()
          if (offData.status === 1 && offData.product) {
            const p = offData.product
            const n = p.nutriments || {}
            const food = {
              _id:    `off-${candidate}`,
              name:   p.product_name || p.product_name_en || 'Unknown Product',
              brand:  p.brands || undefined,
              category: p.categories_tags?.[0]?.replace(/^en:/, '') || 'Other',
              servingSize: 100,
              servingUnit: 'g' as const,
              alternateServings: (p.serving_quantity && p.serving_quantity > 0 && p.serving_quantity !== 100)
                ? [{ label: p.serving_size || `${p.serving_quantity}g`, multiplier: p.serving_quantity / 100 }]
                : [],
              nutrition: {
                calories: Math.round(n['energy-kcal_100g'] ?? n.energy_kcal_100g ?? 0),
                protein:  Math.round((n.proteins_100g     ?? 0) * 10) / 10,
                carbs:    Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
                fats:     Math.round((n.fat_100g          ?? 0) * 10) / 10,
                fiber:    n.fiber_100g   != null ? Math.round(n.fiber_100g   * 10) / 10 : undefined,
                sugar:    n.sugars_100g  != null ? Math.round(n.sugars_100g  * 10) / 10 : undefined,
                sodium:   n.sodium_100g  != null ? Math.round(n.sodium_100g  * 1000) / 1000 : undefined,
              },
              barcode:          candidate,
              source:           'openfoodfacts' as const,
              image_url:        p.image_url || undefined,
              nutriscore_grade: p.nutriscore_grade || undefined,
            }
            return NextResponse.json({ food })
          }
        }
      } catch {
        // Live OFF API unreachable — continue
      }
    }

    // Nothing found in any source
    return NextResponse.json({ food: null })
  } catch (error) {
    console.error('Error looking up barcode:', error)
    return NextResponse.json({ error: 'Failed to look up barcode' }, { status: 500 })
  }
}
