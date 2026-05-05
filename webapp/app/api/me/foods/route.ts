import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import Food, { IFood } from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { flattenFoodForResponse } from '@/lib/foodImport'

type FoodLean = IFood & { _id: mongoose.Types.ObjectId }

// ---------------------------------------------------------------------------
// GET /api/me/foods
//
// Returns the authenticated user's saved foods, populated with the full Food
// document and flattened to match the search-results shape. Sorted by savedAt
// descending so the most-recently-saved appears first.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const user = await User.findById(authResult.userId)
      .select('savedFoods')
      .lean<{ savedFoods?: { foodId: mongoose.Types.ObjectId; savedAt: Date }[] } | null>()

    const saved = user?.savedFoods ?? []
    if (saved.length === 0) {
      return NextResponse.json({ foods: [] })
    }

    // Sort by savedAt desc
    const sorted = [...saved].sort((a, b) => {
      const ta = a.savedAt ? new Date(a.savedAt).getTime() : 0
      const tb = b.savedAt ? new Date(b.savedAt).getTime() : 0
      return tb - ta
    })

    const foodIds = sorted.map(s => s.foodId)
    const foodDocs = await Food.find({ _id: { $in: foodIds } }).lean<FoodLean[]>()
    const foodMap = new Map(foodDocs.map(f => [f._id.toString(), f]))

    const foods = sorted
      .map(s => {
        const doc = foodMap.get(s.foodId.toString())
        if (!doc) return null
        return {
          ...flattenFoodForResponse(doc),
          isSaved: true,
          savedAt: s.savedAt,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ foods })
  } catch (error) {
    console.error('Error fetching saved foods:', error)
    return NextResponse.json({ error: 'Failed to fetch saved foods' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/me/foods
//
// Body: { foodId: string }
// Idempotent — re-saving the same food is a no-op (returns alreadyExists:true).
// Validates that the foodId references an existing Food document.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const foodIdRaw = body?.foodId
    if (!foodIdRaw || typeof foodIdRaw !== 'string') {
      return NextResponse.json({ error: 'foodId is required' }, { status: 400 })
    }

    if (!mongoose.Types.ObjectId.isValid(foodIdRaw)) {
      return NextResponse.json({ error: 'Invalid foodId' }, { status: 400 })
    }

    await dbConnect()

    const foodId = new mongoose.Types.ObjectId(foodIdRaw)

    // Validate the food exists
    const exists = await Food.exists({ _id: foodId })
    if (!exists) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 })
    }

    // Check whether the user already has this food saved.
    // We use a manual check rather than $addToSet because subdocs include savedAt
    // which would never collide and prevent dedup.
    const already = await User.findOne({
      _id: authResult.userId,
      'savedFoods.foodId': foodId,
    }).select('_id').lean()

    if (already) {
      return NextResponse.json({ saved: true, alreadyExists: true })
    }

    await User.findByIdAndUpdate(authResult.userId, {
      $push: { savedFoods: { foodId, savedAt: new Date() } },
    })

    return NextResponse.json({ saved: true, alreadyExists: false })
  } catch (error) {
    console.error('Error saving food:', error)
    return NextResponse.json({ error: 'Failed to save food' }, { status: 500 })
  }
}
