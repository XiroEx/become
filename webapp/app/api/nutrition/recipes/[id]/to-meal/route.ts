import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Meal, { computeTotalNutrition, IMealItem } from '@/models/Meal'
import Recipe, { IRecipeIngredient } from '@/models/Recipe'
import Food from '@/models/Food'
import RecipeImage from '@/models/RecipeImage'
import { verifyAuth } from '@/lib/auth'
import { requireQuota } from '@/lib/entitlementGuards'
import { recipeConvertMode, convertDeletesSource } from '@/lib/nutrition/recipeConvert'

// POST /api/nutrition/recipes/[id]/to-meal — convert a Recipe into a Meal
// (a loggable group of foods). Copies ingredients → items (per-serving
// nutrition) and keeps the recipe metadata.
//
// For the OWNER this is a MOVE: the meal replaces the recipe. For anyone else
// looking at a PUBLIC recipe it is a COPY and deletes nothing — see
// lib/nutrition/recipeConvert.ts for why. The mode is reported back in the
// response so the client never has to guess whether the source survived.

const r1 = (n: number) => Math.round(n * 10) / 10

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Validate the id BEFORE opening a connection — a malformed id can never
    // reach the database, and the 400 branch stays testable without one.
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid recipe id' }, { status: 400 })
    }
    await dbConnect()
    const recipe = await Recipe.findById(id)
    if (!recipe) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    // Ownership decides whether anything is DESTROYED, and it is resolved once,
    // here, before the meal is minted. `isPublic` grants a copy, never a move.
    const mode = recipeConvertMode(recipe, auth.userId)
    if (mode === 'forbidden') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // This mints a Meal, so it is a custom-meal create like POST /api/meals.
    // Left ungated it would be a free bypass of the 3-meal allowance.
    const gate = await requireQuota(request, 'custom-meals')
    if (!gate.ok) return gate.response

    const items = (recipe.ingredients || []).map((ing: IRecipeIngredient) => {
      const amt = ing.amount && ing.amount > 0 ? ing.amount : 1
      // Ingredient nutrition is the total for `amount`; store per-serving so
      // per-serving × servings reproduces the original contribution.
      return {
        foodId: ing.foodId,
        variantId: ing.variantId,
        variantName: ing.variantName,
        name: ing.name,
        servingSize: 1,
        servingUnit: ing.unit || 'serving',
        servings: amt,
        nutrition: {
          calories: Math.round((ing.nutrition?.calories ?? 0) / amt),
          protein: r1((ing.nutrition?.protein ?? 0) / amt),
          carbs: r1((ing.nutrition?.carbs ?? 0) / amt),
          fats: r1((ing.nutrition?.fats ?? 0) / amt),
        },
      }
    })

    const totalNutrition = computeTotalNutrition(items as unknown as IMealItem[])

    const meal = await Meal.create({
      name: recipe.name,
      description: recipe.description,
      imageUrl: recipe.imageUrl,
      items,
      recipe: {
        instructions: recipe.instructions ?? [],
        servings: recipe.servings ?? 1,
        gramsPerServing: recipe.gramsPerServing,
        mlPerServing: recipe.mlPerServing,
      },
      tags: recipe.tags ?? [],
      createdBy: new mongoose.Types.ObjectId(auth.userId),
      isPublic: false,
      isVerified: false,
      totalNutrition,
      usageCount: 0,
    })

    // For the OWNER, "turn into" = MOVE: remove the source recipe now that the
    // meal exists (only after a successful create). Clear the recipe
    // back-pointer on any Food minted from it (kept — foods are independent)
    // and drop its image.
    //
    // For a non-owner this block MUST NOT run. Deleting here on a public recipe
    // destroyed another member's data; that is the bug this branch exists to
    // close, so it is keyed on the ownership decision above and never on read
    // access.
    if (convertDeletesSource(mode)) {
      await Food.updateMany({ recipeId: recipe._id }, { $unset: { recipeId: 1 } }).catch(() => null)
      await Recipe.deleteOne({ _id: recipe._id })
      await RecipeImage.deleteOne({ recipeId: recipe._id }).catch(() => null)
    }

    return NextResponse.json({ success: true, meal, mode }, { status: 201 })
  } catch (error) {
    console.error('Error converting recipe to meal:', error)
    const msg = error instanceof Error ? error.message : 'Failed to convert recipe to meal'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
