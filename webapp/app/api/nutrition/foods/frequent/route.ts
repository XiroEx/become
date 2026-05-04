import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import NutritionLog from '@/models/NutritionLog'
import Food, { IFood } from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { flattenFoodForResponse } from '@/lib/foodImport'

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

    // Fetch full Food docs for those with foodIds
    const foodIds = results
      .filter(r => r._id.foodId)
      .map(r => r._id.foodId)

    const foodDocs = foodIds.length > 0
      ? await Food.find({ _id: { $in: foodIds } }).lean<(IFood & { _id: mongoose.Types.ObjectId })[]>()
      : []

    const foodMap = new Map(foodDocs.map(fi => [fi._id.toString(), fi]))

    // Build response
    const foods = results.map(r => {
      const foodId = r._id.foodId?.toString()
      const foodDoc = foodId ? foodMap.get(foodId) : null
      const flat = foodDoc ? flattenFoodForResponse(foodDoc) : null

      return {
        name: r._id.name,
        foodId: foodId || null,
        count: r.count,
        nutrition: flat?.nutrition || r.lastNutrition,
        servingSize: flat?.servingSize || r.lastServingSize,
        servingUnit: flat?.servingUnit || r.lastServingUnit,
        brand: flat?.brand || r.lastBrand,
        category: flat?.category || null,
        foodItem: flat || null,
      }
    })

    return NextResponse.json({ foods })
  } catch (error) {
    console.error('Error fetching frequent foods:', error)
    return NextResponse.json({ error: 'Failed to fetch frequent foods' }, { status: 500 })
  }
}
