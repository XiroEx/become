import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal, { computeTotalNutrition } from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'
import { requireQuota } from '@/lib/entitlementGuards'
import { resolveItemsFromInput, MealItemInput } from '@/lib/mealItems'
import { createStrict } from '@/lib/strictCreate'

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
      // Match the meal's default slot OR any of its arbitrary tags.
      const tagCond = { $or: [{ defaultTag: tag }, { tags: tag }] }
      filter = Object.keys(filter).length ? { $and: [filter, tagCond] } : tagCond
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

// POST: create a meal template. Quota-gated (free tier: 3 saved meals, counted
// live so deleting one frees a slot). PATCH on an existing meal stays on
// requireFeature and DELETE stays ungated.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireQuota(request, 'custom-meals')
    if (!gate.ok) return gate.response

    const body = await request.json()
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 })
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'items[] is required and must be non-empty' }, { status: 400 })
    }

    await dbConnect()

    const itemsInput: MealItemInput[] = body.items
    const items = await resolveItemsFromInput(itemsInput)

    // gate.role is loaded from the User row by loadUserEntitlement(), not read
    // off the token claim, so a demoted admin cannot mint a verified meal.
    const isAdmin = gate.role === 'admin'

    // createStrict, not Model.create: an unknown top-level key is a dropped
    // field, and the field this route pins is ownership. See lib/strictCreate.ts.
    const meal = await createStrict(Meal, {
      name: body.name,
      description: body.description,
      imageUrl: body.imageUrl,
      items,
      recipe: body.recipe,
      tags: Array.isArray(body.tags) ? body.tags : [],
      defaultTag: typeof body.defaultTag === 'string' && body.defaultTag ? body.defaultTag.toLowerCase() : undefined,
      createdBy: gate.userId,
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
