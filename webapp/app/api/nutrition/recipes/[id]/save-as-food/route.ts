import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Recipe from '@/models/Recipe'
import Food from '@/models/Food'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { requireQuota } from '@/lib/entitlementGuards'
import { importManualFood, flattenFoodForResponse } from '@/lib/foodImport'

// ---------------------------------------------------------------------------
// POST /api/nutrition/recipes/[id]/save-as-food
//
// A Recipe's PURPOSE is to become a Food (Turkey Chili → a loggable food).
// This mints a Food from the recipe's per-serving totals, links them both ways
// (recipe.savedFoodId ↔ food.recipeId), and bookmarks it into the user's foods.
// Recipes are never logged directly — once saved, the UI logs this Food.
//
// Idempotent — re-saving returns the existing food.
// ---------------------------------------------------------------------------

async function bookmarkFood(userId: string, foodId: mongoose.Types.ObjectId) {
  const already = await User.findOne({ _id: userId, 'savedFoods.foodId': foodId }).select('_id').lean()
  if (!already) {
    await User.findByIdAndUpdate(userId, { $push: { savedFoods: { foodId, savedAt: new Date() } } })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid recipe id' }, { status: 400 })
    }

    const recipe = await Recipe.findById(id)
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    const isOwner = recipe.createdBy?.toString() === auth.userId
    if (!isOwner && !recipe.isPublic) {
      return NextResponse.json({ error: 'Not authorized to save this recipe' }, { status: 403 })
    }

    // Idempotent: reuse the already-minted food when it still exists.
    if (recipe.savedFoodId) {
      const existingFood = await Food.findById(recipe.savedFoodId)
      if (existingFood) {
        await bookmarkFood(auth.userId, existingFood._id as mongoose.Types.ObjectId)
        return NextResponse.json({
          success: true,
          created: false,
          alreadyExisted: true,
          food: flattenFoodForResponse(existingFood as Parameters<typeof flattenFoodForResponse>[0]),
        })
      }
    }

    // Past the idempotent branch, so this call really does mint a Food:
    // quota-gate it. Placed here so a member at 3/3 re-tapping Save on a
    // recipe they already saved is never refused.
    const quota = await requireQuota(request, 'custom-foods')
    if (!quota.ok) return quota.response

    // Recipe totals are ALREADY per-serving, so 1 serving of the food = 1
    // serving of the recipe — no division needed (unlike meals).
    const t = recipe.totalsPerServing
    const perServing = {
      calories: Math.round(t?.calories ?? 0),
      protein: Math.round((t?.protein ?? 0) * 10) / 10,
      carbs: Math.round((t?.carbs ?? 0) * 10) / 10,
      fats: Math.round((t?.fats ?? 0) * 10) / 10,
      fiber: t?.fiber != null ? Math.round(t.fiber * 10) / 10 : undefined,
    }

    const result = await importManualFood(
      {
        name: recipe.name,
        category: 'Other',
        imageUrl: recipe.imageUrl,
        variants: [{
          name: '1 serving',
          isDefault: true,
          servingSize: 1,
          servingUnit: 'serving',
          alternateServings: [],
          nutrition: perServing,
          gramsPerServing: recipe.gramsPerServing,
          mlPerServing: recipe.mlPerServing,
        }],
      },
      auth.userId,
    )
    const foodDoc = result.food
    const foodId = (foodDoc as { _id: mongoose.Types.ObjectId })._id

    // Link both ways. Only write back to the recipe when the caller owns it, so
    // a non-owner saving a public recipe can't clobber the owner's link.
    await Food.updateOne({ _id: foodId }, { $set: { recipeId: recipe._id } })
    if (isOwner) {
      recipe.savedFoodId = foodId
      await recipe.save()
    }

    await bookmarkFood(auth.userId, foodId)

    return NextResponse.json({
      success: true,
      created: result.created,
      alreadyExisted: false,
      food: flattenFoodForResponse(foodDoc as Parameters<typeof flattenFoodForResponse>[0]),
    })
  } catch (error) {
    console.error('Error saving recipe as food:', error)
    const msg = error instanceof Error ? error.message : 'Failed to save recipe as food'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
