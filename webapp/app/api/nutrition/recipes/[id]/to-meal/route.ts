import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Meal, { computeTotalNutrition, IMealItem } from '@/models/Meal'
import Recipe, { IRecipeIngredient } from '@/models/Recipe'
import { verifyAuth } from '@/lib/auth'

// POST /api/nutrition/recipes/[id]/to-meal — convert a Recipe into a Meal
// (a loggable group of foods). Copies ingredients → items (per-serving
// nutrition) and keeps the recipe metadata. The original recipe is left intact.

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
      return NextResponse.json({ error: 'Invalid recipe id' }, { status: 400 })
    }
    const recipe = await Recipe.findById(id)
    if (!recipe) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    const isOwner = recipe.createdBy?.toString() === auth.userId
    if (!isOwner && !recipe.isPublic) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

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

    return NextResponse.json({ success: true, meal }, { status: 201 })
  } catch (error) {
    console.error('Error converting recipe to meal:', error)
    const msg = error instanceof Error ? error.message : 'Failed to convert recipe to meal'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
