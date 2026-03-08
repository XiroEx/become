import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import FoodItem from '@/models/FoodItem'
import { verifyAuth } from '@/lib/auth'

// GET: Get user's most frequently logged foods
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    // Aggregate food occurrences across all user logs
    const pipeline = [
      { $match: { userId: authResult.userId } },
      { $unwind: '$meals' },
      { $unwind: '$meals.foods' },
      {
        $group: {
          _id: {
            foodId: '$meals.foods.foodId',
            name: '$meals.foods.name'
          },
          count: { $sum: 1 },
          lastNutrition: { $last: '$meals.foods.nutrition' },
          lastServingSize: { $last: '$meals.foods.servingSize' },
          lastServingUnit: { $last: '$meals.foods.servingUnit' },
          lastBrand: { $last: '$meals.foods.brand' }
        }
      },
      { $sort: { count: -1 as const } },
      { $limit: 20 }
    ]

    const results = await NutritionLog.aggregate(pipeline)

    // Fetch full FoodItem docs for those with foodIds
    const foodIds = results
      .filter(r => r._id.foodId)
      .map(r => r._id.foodId)

    const foodItems = foodIds.length > 0
      ? await FoodItem.find({ _id: { $in: foodIds } }).lean()
      : []

    const foodItemMap = new Map(foodItems.map(fi => [fi._id.toString(), fi]))

    // Build response
    const foods = results.map(r => {
      const foodId = r._id.foodId?.toString()
      const foodItem = foodId ? foodItemMap.get(foodId) : null

      return {
        name: r._id.name,
        foodId: foodId || null,
        count: r.count,
        nutrition: foodItem?.nutrition || r.lastNutrition,
        servingSize: foodItem?.servingSize || r.lastServingSize,
        servingUnit: foodItem?.servingUnit || r.lastServingUnit,
        brand: foodItem?.brand || r.lastBrand,
        category: foodItem?.category || null,
        foodItem: foodItem || null
      }
    })

    return NextResponse.json({ foods })
  } catch (error) {
    console.error('Error fetching frequent foods:', error)
    return NextResponse.json({ error: 'Failed to fetch frequent foods' }, { status: 500 })
  }
}
