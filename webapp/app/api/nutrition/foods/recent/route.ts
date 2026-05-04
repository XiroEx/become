import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import Food, { IFood } from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { flattenFoodForResponse } from '@/lib/foodImport'

// GET: Get user's recently logged foods (last 14 days)
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setUTCHours(0, 0, 0, 0)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    // Get recent logs
    const logs = await NutritionLog.find({
      userId: authResult.userId,
      date: { $gte: fourteenDaysAgo }
    })
      .sort({ date: -1 })
      .lean()

    // Extract unique foods, most recently logged first
    const seenFoods = new Map<string, { name: string; foodId?: string; nutrition: unknown; servingSize: number; servingUnit: string; brand?: string; loggedAt: Date }>()

    for (const log of logs) {
      for (const meal of log.meals) {
        for (const food of meal.foods) {
          const key = food.foodId?.toString() || food.name
          if (!seenFoods.has(key)) {
            seenFoods.set(key, {
              name: food.name,
              foodId: food.foodId?.toString(),
              nutrition: food.nutrition,
              servingSize: food.servingSize,
              servingUnit: food.servingUnit,
              brand: food.brand,
              loggedAt: meal.loggedAt
            })
          }
        }
      }
    }

    // Convert to array and limit to 20
    const recentFoods = Array.from(seenFoods.values()).slice(0, 20)

    // Fetch full Food docs for those with foodIds
    const foodIds = recentFoods
      .filter(f => f.foodId)
      .map(f => f.foodId)

    const foodDocs = foodIds.length > 0
      ? await Food.find({ _id: { $in: foodIds } }).lean<(IFood & { _id: mongoose.Types.ObjectId })[]>()
      : []

    const foodMap = new Map(foodDocs.map(fi => [fi._id.toString(), fi]))

    // Enrich with Food data where available
    const enriched = recentFoods.map(food => {
      if (food.foodId && foodMap.has(food.foodId)) {
        return { ...flattenFoodForResponse(foodMap.get(food.foodId)!), lastLoggedAt: food.loggedAt }
      }
      return food
    })

    return NextResponse.json({ foods: enriched })
  } catch (error) {
    console.error('Error fetching recent foods:', error)
    return NextResponse.json({ error: 'Failed to fetch recent foods' }, { status: 500 })
  }
}
