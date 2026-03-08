import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Recipe from '@/models/Recipe'
import { verifyAuth } from '@/lib/auth'

// GET: List recipes (public + user's private)
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
    const mine = searchParams.get('mine')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Base filter: public recipes OR user's own recipes
    let filter: Record<string, unknown>

    if (mine === 'true') {
      filter = { createdBy: authResult.userId }
    } else {
      filter = {
        $or: [
          { isPublic: true },
          { createdBy: authResult.userId }
        ]
      }
    }

    if (category) {
      filter.category = category
    }

    if (q) {
      // Text search
      const textFilter = { ...filter, $text: { $search: q } }
      const textResults = await Recipe.find(textFilter, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()

      // Regex fallback
      const regexFilter = { ...filter, name: { $regex: q, $options: 'i' } }
      const regexResults = await Recipe.find(regexFilter)
        .sort({ usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()

      // Deduplicate
      const seenIds = new Set<string>()
      const combined = []

      for (const r of textResults) {
        const id = r._id.toString()
        if (!seenIds.has(id)) {
          seenIds.add(id)
          combined.push(r)
        }
      }

      for (const r of regexResults) {
        const id = r._id.toString()
        if (!seenIds.has(id)) {
          seenIds.add(id)
          combined.push(r)
        }
      }

      return NextResponse.json({ recipes: combined.slice(0, limit), total: combined.length })
    }

    // No search query
    const recipes = await Recipe.find(filter)
      .sort({ usageCount: -1, createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean()

    const total = await Recipe.countDocuments(filter)

    return NextResponse.json({ recipes, total, offset, limit })
  } catch (error) {
    console.error('Error fetching recipes:', error)
    return NextResponse.json({ error: 'Failed to fetch recipes' }, { status: 500 })
  }
}

// POST: Create a recipe
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.name || !body.category || !body.ingredients) {
      return NextResponse.json({ error: 'Missing required fields: name, category, ingredients' }, { status: 400 })
    }

    await dbConnect()

    // Calculate totalsPerServing from ingredients
    const servings = body.servings || 1
    const totals = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }

    for (const ingredient of body.ingredients) {
      if (ingredient.nutrition) {
        totals.calories += ingredient.nutrition.calories || 0
        totals.protein += ingredient.nutrition.protein || 0
        totals.carbs += ingredient.nutrition.carbs || 0
        totals.fats += ingredient.nutrition.fats || 0
        totals.fiber += ingredient.nutrition.fiber || 0
      }
    }

    const totalsPerServing = {
      calories: Math.round((totals.calories / servings) * 10) / 10,
      protein: Math.round((totals.protein / servings) * 10) / 10,
      carbs: Math.round((totals.carbs / servings) * 10) / 10,
      fats: Math.round((totals.fats / servings) * 10) / 10,
      fiber: Math.round((totals.fiber / servings) * 10) / 10
    }

    const recipe = await Recipe.create({
      ...body,
      createdBy: authResult.userId,
      totalsPerServing: body.totalsPerServing || totalsPerServing,
      usageCount: 0
    })

    return NextResponse.json({ success: true, recipe }, { status: 201 })
  } catch (error) {
    console.error('Error creating recipe:', error)
    return NextResponse.json({ error: 'Failed to create recipe' }, { status: 500 })
  }
}
