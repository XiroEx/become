// ---------------------------------------------------------------------------
// Admin Foods API — list endpoint.
//
//   GET /api/admin/foods
//     ?q=...            full-text + name/brand regex search
//     &flagged=1        return only needsReview foods
//     &source=manual    filter by source (manual | usda | openfoodfacts)
//     &sortBy=recent    recent (default) | usage | name
//     &offset=0
//     &limit=50
//
// Response: { foods: [...], total: number, offset, limit, flaggedCount }
//
// Each food in the list is a `flattenFoodForResponse`-shaped object so the
// admin UI can reuse the same field names as the public foods endpoints.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Food, { IFood } from '@/models/Food'
import { verifyAdmin } from '@/lib/adminAuth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import type mongoose from 'mongoose'

type FoodLean = IFood & { _id: mongoose.Types.ObjectId }

export async function GET(request: NextRequest) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status ?? 401 },
      )
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') ?? '').trim()
    const flagged = searchParams.get('flagged') === '1' || searchParams.get('flagged') === 'true'
    const source = (searchParams.get('source') ?? '').trim()
    const sortBy = (searchParams.get('sortBy') ?? 'recent').trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

    const filter: Record<string, unknown> = {}
    if (flagged) filter.needsReview = true
    if (source && ['manual', 'usda', 'openfoodfacts'].includes(source)) filter.source = source
    if (q) {
      // Match against name + brand + aliases (case-insensitive). Avoid $text
      // here so the admin can search partials and substrings of brands.
      const regex = { $regex: q, $options: 'i' }
      filter.$or = [{ name: regex }, { brand: regex }, { aliases: regex }, { slug: regex }]
    }

    const sort: Record<string, 1 | -1> = sortBy === 'usage'
      ? { usageCount: -1, updatedAt: -1 }
      : sortBy === 'name'
        ? { name: 1 }
        : { updatedAt: -1, createdAt: -1 } // 'recent' default

    const [foods, total, flaggedCount] = await Promise.all([
      Food.find(filter).sort(sort).skip(offset).limit(limit).lean<FoodLean[]>(),
      Food.countDocuments(filter),
      // Always returns the global flagged count so the UI can show a chip
      // count regardless of the active filter.
      Food.countDocuments({ needsReview: true }),
    ])

    return NextResponse.json({
      foods: foods.map(f => ({
        ...flattenFoodForResponse(f),
        source: f.source || 'manual',
      })),
      total,
      offset,
      limit,
      flaggedCount,
    })
  } catch (error) {
    console.error('Admin foods list error:', error)
    return NextResponse.json({ error: 'Failed to list foods' }, { status: 500 })
  }
}
