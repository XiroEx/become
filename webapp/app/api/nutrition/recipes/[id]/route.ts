import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Recipe from '@/models/Recipe'
import { verifyAuth } from '@/lib/auth'

// GET: Get a single recipe by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const recipe = await Recipe.findById(id).lean()

    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    // Check access: public or owned by user
    if (!recipe.isPublic && recipe.createdBy?.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    return NextResponse.json(recipe)
  } catch (error) {
    console.error('Error fetching recipe:', error)
    return NextResponse.json({ error: 'Failed to fetch recipe' }, { status: 500 })
  }
}

// PUT: Update a recipe (only if owner)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const recipe = await Recipe.findById(id)

    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    if (recipe.createdBy?.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized to update this recipe' }, { status: 403 })
    }

    const body = await request.json()

    // If ingredients changed, recalculate totalsPerServing
    if (body.ingredients) {
      const servings = body.servings || recipe.servings || 1
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

      body.totalsPerServing = body.totalsPerServing || {
        calories: Math.round((totals.calories / servings) * 10) / 10,
        protein: Math.round((totals.protein / servings) * 10) / 10,
        carbs: Math.round((totals.carbs / servings) * 10) / 10,
        fats: Math.round((totals.fats / servings) * 10) / 10,
        fiber: Math.round((totals.fiber / servings) * 10) / 10
      }
    }

    // Update fields
    Object.assign(recipe, body)
    await recipe.save()

    return NextResponse.json({ success: true, recipe })
  } catch (error) {
    console.error('Error updating recipe:', error)
    return NextResponse.json({ error: 'Failed to update recipe' }, { status: 500 })
  }
}

// DELETE: Delete a recipe (only if owner)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const recipe = await Recipe.findById(id)

    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    if (recipe.createdBy?.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized to delete this recipe' }, { status: 403 })
    }

    await Recipe.deleteOne({ _id: id })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting recipe:', error)
    return NextResponse.json({ error: 'Failed to delete recipe' }, { status: 500 })
  }
}
