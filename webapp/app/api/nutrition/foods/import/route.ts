import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Food from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { isVerifiedAdmin } from '@/lib/adminAuth'
import {
  importFromUSDA,
  importFromOpenFoodFacts,
  importManualFood,
  flattenFoodForResponse,
  ManualFoodInput,
} from '@/lib/foodImport'

// ---------------------------------------------------------------------------
// POST /api/nutrition/foods/import
//
// Body shapes:
//   { source: 'usda', externalId: string }
//   { source: 'openfoodfacts', externalId: string }
//   { source: 'manual', data: ManualFoodInput }
//
// Response: { food, created } where `food` is the flattened Food doc.
// Increments usageCount by 1 on every successful call (the import itself
// counts as a usage).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const source = body.source as string | undefined
    if (source !== 'usda' && source !== 'openfoodfacts' && source !== 'manual') {
      return NextResponse.json({ error: "Invalid source. Must be 'usda', 'openfoodfacts', or 'manual'." }, { status: 400 })
    }

    await dbConnect()

    let food
    let created = false

    if (source === 'usda') {
      const externalId = String(body.externalId || '').trim()
      if (!externalId) {
        return NextResponse.json({ error: 'externalId is required for source=usda' }, { status: 400 })
      }
      const r = await importFromUSDA(externalId, authResult.userId)
      food = r.food
      created = r.created
    } else if (source === 'openfoodfacts') {
      const externalId = String(body.externalId || '').trim()
      if (!externalId) {
        return NextResponse.json({ error: 'externalId is required for source=openfoodfacts' }, { status: 400 })
      }
      const r = await importFromOpenFoodFacts(externalId, authResult.userId)
      food = r.food
      created = r.created
    } else {
      // manual
      const data = (body.data ?? body) as ManualFoodInput
      if (!data || !data.name) {
        return NextResponse.json({ error: 'data.name is required for source=manual' }, { status: 400 })
      }
      // `data` is a request body, so `data.barcode` is whatever the client
      // typed. A barcode is unique+sparse and is the first thing
      // GET /api/nutrition/foods/barcode resolves, ahead of OFF and USDA and
      // with no check on `source` — so honouring one here lets a member plant a
      // row on a real UPC and hijack that product's scan for everyone. Dropped
      // for members; admins curate the catalogue and keep it (their real
      // surface for this is PATCH /api/admin/foods/[id]).
      const trustedBarcode = await isVerifiedAdmin(authResult)
      const r = await importManualFood(data, authResult.userId, { trustedBarcode })
      food = r.food
      created = r.created
    }

    // Increment usageCount — first pick counts
    await Food.updateOne({ _id: food._id }, { $inc: { usageCount: 1 } })

    // Re-fetch to get the bumped count
    const fresh = await Food.findById(food._id).lean<(import('@/models/Food').IFood & { _id: import('mongoose').Types.ObjectId }) | null>()
    if (!fresh) {
      // extremely unlikely race — fall back to the pre-increment doc
      return NextResponse.json({
        success: true,
        created,
        food: flattenFoodForResponse(food as import('@/models/Food').IFood & { _id: import('mongoose').Types.ObjectId }),
      }, { status: created ? 201 : 200 })
    }

    return NextResponse.json({
      success: true,
      created,
      food: flattenFoodForResponse(fresh),
    }, { status: created ? 201 : 200 })
  } catch (error) {
    console.error('Error importing food:', error)
    const msg = error instanceof Error ? error.message : 'Failed to import food'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
