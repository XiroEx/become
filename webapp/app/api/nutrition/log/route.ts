import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import NutritionGoal from '@/models/NutritionGoal'
import FoodItem from '@/models/FoodItem'
import { verifyAuth } from '@/lib/auth'

function getDateStart(dateStr?: string | null): Date {
  const d = dateStr ? new Date(dateStr + 'T00:00:00.000Z') : new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// GET: Get day's nutrition log by ?date=YYYY-MM-DD (defaults to today)
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const date = getDateStart(searchParams.get('date'))

    const log = await NutritionLog.findOne({ userId: authResult.userId, date }).lean()

    if (log) {
      return NextResponse.json(log)
    }

    // No log exists for this day — return empty structure with goals
    const goals = await NutritionGoal.findOne({ userId: authResult.userId }).lean()

    return NextResponse.json({
      userId: authResult.userId,
      date,
      meals: [],
      water: {
        current: 0,
        goal: goals?.waterGoal ?? 96
      },
      quickAdds: [],
      dailyTotals: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0
      },
      goals: goals || {
        calories: 2000,
        protein: 150,
        carbs: 200,
        fats: 65,
        waterGoal: 96
      }
    })
  } catch (error) {
    console.error('Error fetching nutrition log:', error)
    return NextResponse.json({ error: 'Failed to fetch nutrition log' }, { status: 500 })
  }
}

// POST: Add a food entry to a meal
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mealType, food, date: dateStr } = body

    if (!mealType || !food || !food.name || !food.nutrition) {
      return NextResponse.json({ error: 'Missing required fields: mealType, food.name, food.nutrition' }, { status: 400 })
    }

    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) {
      return NextResponse.json({ error: 'Invalid mealType' }, { status: 400 })
    }

    await dbConnect()

    const date = getDateStart(dateStr)
    const foodEntryId = crypto.randomUUID()

    const foodEntry = {
      id: foodEntryId,
      foodId: food.foodId || undefined,
      name: food.name,
      brand: food.brand || undefined,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      servings: food.servings ?? 1,
      nutrition: food.nutrition
    }

    // Find or create the day's log
    let log = await NutritionLog.findOne({ userId: authResult.userId, date })

    if (!log) {
      const goals = await NutritionGoal.findOne({ userId: authResult.userId }).lean()
      log = new NutritionLog({
        userId: authResult.userId,
        date,
        meals: [],
        water: { current: 0, goal: goals?.waterGoal ?? 96 },
        quickAdds: [],
        dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0 }
      })
    }

    // Find existing meal of this type or create new one
    let meal = log.meals.find((m: { mealType: string }) => m.mealType === mealType)

    if (meal) {
      meal.foods.push(foodEntry)
    } else {
      log.meals.push({
        id: crypto.randomUUID(),
        mealType,
        foods: [foodEntry],
        loggedAt: new Date()
      })
    }

    // Recalculate daily totals
    log.recalculateTotals()
    await log.save()

    // Increment usageCount on FoodItem if foodId provided
    if (food.foodId) {
      await FoodItem.updateOne({ _id: food.foodId }, { $inc: { usageCount: 1 } })
    }

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error adding food entry:', error)
    return NextResponse.json({ error: 'Failed to add food entry' }, { status: 500 })
  }
}

// PUT: Update a food entry
export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { mealId, foodEntryId, updates, date: dateStr } = body

    if (!mealId || !foodEntryId || !updates) {
      return NextResponse.json({ error: 'Missing required fields: mealId, foodEntryId, updates' }, { status: 400 })
    }

    await dbConnect()

    const date = getDateStart(dateStr)
    const log = await NutritionLog.findOne({ userId: authResult.userId, date })

    if (!log) {
      return NextResponse.json({ error: 'No nutrition log found for this date' }, { status: 404 })
    }

    const meal = log.meals.find((m: { id: string }) => m.id === mealId)
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const foodEntry = meal.foods.find((f: { id: string }) => f.id === foodEntryId)
    if (!foodEntry) {
      return NextResponse.json({ error: 'Food entry not found' }, { status: 404 })
    }

    // Calculate proportional nutrition changes
    const oldServings = foodEntry.servings
    const oldServingSize = foodEntry.servingSize
    const baseNutrition = {
      calories: foodEntry.nutrition.calories / oldServings,
      protein: foodEntry.nutrition.protein / oldServings,
      carbs: foodEntry.nutrition.carbs / oldServings,
      fats: foodEntry.nutrition.fats / oldServings,
      fiber: (foodEntry.nutrition.fiber || 0) / oldServings,
      sugar: (foodEntry.nutrition.sugar || 0) / oldServings,
      sodium: (foodEntry.nutrition.sodium || 0) / oldServings,
    }

    if (updates.servings !== undefined) {
      foodEntry.servings = updates.servings
    }

    if (updates.servingSize !== undefined) {
      const sizeRatio = updates.servingSize / oldServingSize
      foodEntry.servingSize = updates.servingSize
      // Adjust base nutrition proportionally to serving size change
      baseNutrition.calories *= sizeRatio
      baseNutrition.protein *= sizeRatio
      baseNutrition.carbs *= sizeRatio
      baseNutrition.fats *= sizeRatio
      baseNutrition.fiber *= sizeRatio
      baseNutrition.sugar *= sizeRatio
      baseNutrition.sodium *= sizeRatio
    }

    // Recalculate this food's nutrition based on new values
    foodEntry.nutrition.calories = Math.round(baseNutrition.calories * foodEntry.servings * 10) / 10
    foodEntry.nutrition.protein = Math.round(baseNutrition.protein * foodEntry.servings * 10) / 10
    foodEntry.nutrition.carbs = Math.round(baseNutrition.carbs * foodEntry.servings * 10) / 10
    foodEntry.nutrition.fats = Math.round(baseNutrition.fats * foodEntry.servings * 10) / 10
    foodEntry.nutrition.fiber = Math.round(baseNutrition.fiber * foodEntry.servings * 10) / 10
    foodEntry.nutrition.sugar = Math.round(baseNutrition.sugar * foodEntry.servings * 10) / 10
    foodEntry.nutrition.sodium = Math.round(baseNutrition.sodium * foodEntry.servings * 10) / 10

    // Recalculate daily totals
    log.recalculateTotals()
    await log.save()

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error updating food entry:', error)
    return NextResponse.json({ error: 'Failed to update food entry' }, { status: 500 })
  }
}

// DELETE: Remove a food entry
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Support both body and query params
    let mealId: string | null = null
    let foodEntryId: string | null = null
    let dateStr: string | null = null

    const { searchParams } = new URL(request.url)
    mealId = searchParams.get('mealId')
    foodEntryId = searchParams.get('foodEntryId')
    dateStr = searchParams.get('date')

    if (!mealId || !foodEntryId) {
      try {
        const body = await request.json()
        mealId = body.mealId || mealId
        foodEntryId = body.foodEntryId || foodEntryId
        dateStr = body.date || dateStr
      } catch {
        // Body parsing failed, rely on query params
      }
    }

    if (!mealId || !foodEntryId) {
      return NextResponse.json({ error: 'Missing required fields: mealId, foodEntryId' }, { status: 400 })
    }

    await dbConnect()

    const date = getDateStart(dateStr)
    const log = await NutritionLog.findOne({ userId: authResult.userId, date })

    if (!log) {
      return NextResponse.json({ error: 'No nutrition log found for this date' }, { status: 404 })
    }

    const mealIndex = log.meals.findIndex((m: { id: string }) => m.id === mealId)
    if (mealIndex === -1) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const meal = log.meals[mealIndex]
    const foodIndex = meal.foods.findIndex((f: { id: string }) => f.id === foodEntryId)
    if (foodIndex === -1) {
      return NextResponse.json({ error: 'Food entry not found' }, { status: 404 })
    }

    // Remove the food entry
    meal.foods.splice(foodIndex, 1)

    // If meal is now empty, remove the meal
    if (meal.foods.length === 0) {
      log.meals.splice(mealIndex, 1)
    }

    // Recalculate daily totals
    log.recalculateTotals()
    await log.save()

    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error deleting food entry:', error)
    return NextResponse.json({ error: 'Failed to delete food entry' }, { status: 500 })
  }
}
