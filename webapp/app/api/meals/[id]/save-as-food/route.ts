import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Meal from '@/models/Meal'
import Food from '@/models/Food'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { importManualFood, flattenFoodForResponse } from '@/lib/foodImport'
import { estimatedGramsPerServing, estimatedMlPerServing } from '@/lib/recipeMath'

// ---------------------------------------------------------------------------
// POST /api/meals/[id]/save-as-food
//
// Mints a Food document from one of the user's own meals and bookmarks it
// into User.savedFoods so it appears in the "My Foods" tab. The food's
// nutrition is the meal's totalNutrition divided by recipe.servings (when
// present) so 1 serving of the food = 1 portion of the meal.
//
// Idempotent — re-saving the same meal returns the existing food.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid meal id' }, { status: 400 })
    }

    const meal = await Meal.findById(id)
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === auth.userId
    if (!isOwner) {
      return NextResponse.json({ error: 'Not authorized to save this meal' }, { status: 403 })
    }

    // Per-serving nutrition. Default to whole meal when no recipe.servings.
    const servings = meal.recipe?.servings && meal.recipe.servings > 0 ? meal.recipe.servings : 1
    const t = meal.totalNutrition
    const perServing = {
      calories: Math.round((t?.calories ?? 0) / servings),
      protein: Math.round(((t?.protein ?? 0) / servings) * 10) / 10,
      carbs: Math.round(((t?.carbs ?? 0) / servings) * 10) / 10,
      fats: Math.round(((t?.fats ?? 0) / servings) * 10) / 10,
      fiber: t?.fiber != null ? Math.round((t.fiber / servings) * 10) / 10 : undefined,
      sugar: t?.sugar != null ? Math.round((t.sugar / servings) * 10) / 10 : undefined,
      sodium: t?.sodium != null ? Math.round((t.sodium / servings) * 1000) / 1000 : undefined,
      saturatedFat: t?.saturatedFat != null ? Math.round((t.saturatedFat / servings) * 10) / 10 : undefined,
    }

    // Reuse if this user already saved this meal as a food (matched by name +
    // owner). Avoids duplicating Food docs every time the button is tapped.
    const existing = await Food.findOne({
      name: meal.name,
      createdBy: new mongoose.Types.ObjectId(auth.userId!),
      source: 'manual',
    })

    let foodDoc = existing
    let created = false
    if (!foodDoc) {
      // Bridge values: prefer the user's explicit override stored on
      // meal.recipe.gramsPerServing / mlPerServing (UNITS_AND_SERVINGS_PLAN
      // §10.8). When the override is absent we fall back to the
      // recipe-items estimator. Either source may legitimately be undefined,
      // which is the honest signal "we don't know" and the picker handles it.
      const overrideGrams = meal.recipe?.gramsPerServing
      const overrideMl = meal.recipe?.mlPerServing
      const gramsPerServing = overrideGrams ?? (await estimatedGramsPerServing(meal))
      const mlPerServing = overrideMl ?? estimatedMlPerServing(meal)

      const result = await importManualFood(
        {
          name: meal.name,
          category: 'Other',
          imageUrl: meal.imageUrl,
          variants: [{
            name: '1 serving',
            isDefault: true,
            servingSize: 1,
            servingUnit: 'serving',
            alternateServings: [],
            nutrition: perServing,
            gramsPerServing,
            mlPerServing,
          }],
        },
        auth.userId,
      )
      foodDoc = result.food
      created = result.created
    }

    // Bookmark to My Foods if not already there.
    const foodId = (foodDoc as { _id: mongoose.Types.ObjectId })._id
    const already = await User.findOne({
      _id: auth.userId,
      'savedFoods.foodId': foodId,
    }).select('_id').lean()

    if (!already) {
      await User.findByIdAndUpdate(auth.userId, {
        $push: { savedFoods: { foodId, savedAt: new Date() } },
      })
    }

    return NextResponse.json({
      success: true,
      created,
      alreadyExisted: !!existing,
      food: flattenFoodForResponse(foodDoc as Parameters<typeof flattenFoodForResponse>[0]),
    })
  } catch (error) {
    console.error('Error saving meal as food:', error)
    const msg = error instanceof Error ? error.message : 'Failed to save meal as food'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
