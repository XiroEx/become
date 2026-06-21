import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Meal, { IMealItem } from '@/models/Meal'
import Recipe from '@/models/Recipe'
import { verifyAuth } from '@/lib/auth'

// POST /api/meals/[id]/to-recipe — convert a Meal (loggable group) into a Recipe
// (a group intended to become a Food). Copies items → ingredients and derives
// per-serving totals. The original meal is left intact.

const r1 = (n: number) => Math.round(n * 10) / 10

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid meal id' }, { status: 400 })
    }
    const meal = await Meal.findById(id)
    if (!meal) return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    if (meal.createdBy?.toString() !== auth.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const servings = meal.recipe?.servings && meal.recipe.servings > 0 ? meal.recipe.servings : 1
    const t = meal.totalNutrition || { calories: 0, protein: 0, carbs: 0, fats: 0 }

    const ingredients = (meal.items || []).map((it: IMealItem) => {
      const qty = it.servings ?? 1
      return {
        foodId: it.foodId,
        variantId: it.variantId,
        variantName: it.variantName,
        name: it.name,
        amount: qty,
        unit: it.servingUnit || 'serving',
        // Recipe ingredient nutrition is the total contribution of that amount.
        nutrition: {
          calories: Math.round((it.nutrition?.calories ?? 0) * qty),
          protein: r1((it.nutrition?.protein ?? 0) * qty),
          carbs: r1((it.nutrition?.carbs ?? 0) * qty),
          fats: r1((it.nutrition?.fats ?? 0) * qty),
        },
      }
    })

    const totalsPerServing = {
      calories: Math.round((t.calories ?? 0) / servings),
      protein: r1((t.protein ?? 0) / servings),
      carbs: r1((t.carbs ?? 0) / servings),
      fats: r1((t.fats ?? 0) / servings),
      fiber: t.fiber != null ? r1(t.fiber / servings) : undefined,
    }

    const recipe = await Recipe.create({
      name: meal.name,
      description: meal.description,
      category: 'Other',
      servings,
      ingredients,
      instructions: meal.recipe?.instructions ?? [],
      totalsPerServing,
      gramsPerServing: meal.recipe?.gramsPerServing,
      mlPerServing: meal.recipe?.mlPerServing,
      tags: meal.tags ?? [],
      isPublic: false,
      createdBy: new mongoose.Types.ObjectId(auth.userId),
      imageUrl: meal.imageUrl,
      usageCount: 0,
    })

    // "Turn into" = MOVE, not copy. Remove the source meal now that the recipe
    // exists. Only after a successful create so a failure never loses the meal.
    await Meal.deleteOne({ _id: meal._id })

    return NextResponse.json({ success: true, recipe }, { status: 201 })
  } catch (error) {
    console.error('Error converting meal to recipe:', error)
    const msg = error instanceof Error ? error.message : 'Failed to convert meal to recipe'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
