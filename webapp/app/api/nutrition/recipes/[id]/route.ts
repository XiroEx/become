import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Recipe from '@/models/Recipe'
import Food from '@/models/Food'
import RecipeImage from '@/models/RecipeImage'
import { verifyAuth } from '@/lib/auth'
import { pickRecipeFields } from '@/lib/nutrition/recipeFields'

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
      const candidates = [body.servings, recipe.servings]
      const validServings = candidates.find(
        (n) => typeof n === 'number' && Number.isFinite(n) && n > 0,
      )
      const servings = validServings ?? 1
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

    // Update fields — through the same allowlist the create path uses. A blind
    // Object.assign let the body rewrite createdBy, usageCount and savedFoodId.
    Object.assign(recipe, pickRecipeFields(body))
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

    // Don't orphan references: any Food minted from this recipe keeps a
    // `recipeId` back-pointer — clear it so it never dangles. Also drop the
    // recipe's stored image. Foods themselves are independent (own nutrition)
    // and are intentionally kept.
    await Promise.all([
      Food.updateMany({ recipeId: recipe._id }, { $unset: { recipeId: 1 } }),
      RecipeImage.deleteOne({ recipeId: recipe._id }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting recipe:', error)
    return NextResponse.json({ error: 'Failed to delete recipe' }, { status: 500 })
  }
}
