import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal, { computeTotalNutrition } from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'
import { requireFeature } from '@/lib/entitlements'
import { resolveItemsFromInput, MealItemInput } from '@/lib/mealItems'

// GET: list user's own meals + public/verified meals.
// Query params: q, tag, mine=true, limit, offset
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const tag = searchParams.get('tag')
    const mine = searchParams.get('mine') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let filter: Record<string, unknown>
    if (mine) {
      filter = { createdBy: authResult.userId }
    } else {
      filter = {
        $or: [
          { createdBy: authResult.userId },
          { isPublic: true },
          { isVerified: true },
        ],
      }
    }

    if (tag) {
      filter.tags = tag
    }

    let meals
    let total
    if (q) {
      // Combine $text search with regex fallback for partial matches.
      const textFilter = { ...filter, $text: { $search: q } }
      const textResults = await Meal.find(textFilter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()

      const regexFilter = { ...filter, name: { $regex: q, $options: 'i' } }
      const regexResults = await Meal.find(regexFilter)
        .sort({ usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()

      const seen = new Set<string>()
      const combined: typeof textResults = []
      for (const r of [...textResults, ...regexResults]) {
        const id = r._id.toString()
        if (!seen.has(id)) {
          seen.add(id)
          combined.push(r)
        }
      }
      meals = combined.slice(0, limit)
      total = combined.length
    } else {
      meals = await Meal.find(filter)
        .sort({ usageCount: -1, updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
      total = await Meal.countDocuments(filter)
    }

    return NextResponse.json({ meals, total, offset, limit })
  } catch (error) {
    console.error('Error listing meals:', error)
    return NextResponse.json({ error: 'Failed to list meals' }, { status: 500 })
  }
}

// POST: create a meal template
export async function POST(request: NextRequest) {
  try {
    const gate = await requireFeature(request, 'custom-meals')
    if (!gate.ok) return gate.response
    const authResult = { success: true as const, userId: gate.userId, role: gate.role }

    const body = await request.json()
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
    }

    await dbConnect()

    const itemsInput: MealItemInput[] = Array.isArray(body.items) ? body.items : []
    const items = await resolveItemsFromInput(itemsInput)

    const isAdmin = authResult.role === 'admin'

    const meal = await Meal.create({
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      items,
      recipe: body.recipe,
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdBy: authResult.userId,
      isPublic: !!body.isPublic,
      // Only admins may mark meals verified at creation time.
      isVerified: isAdmin && !!body.isVerified,
      totalNutrition: computeTotalNutrition(items),
      usageCount: 0,
    })

    return NextResponse.json({ success: true, meal }, { status: 201 })
  } catch (error) {
    console.error('Error creating meal:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create meal' }, { status: 500 })
  }
}
