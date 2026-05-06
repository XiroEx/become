import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal from '@/models/Meal'
import MealLog from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'

const DEFAULT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const [logTags, mealTags] = await Promise.all([
      MealLog.distinct('tags', { user: authResult.userId }),
      Meal.distinct('tags', { createdBy: authResult.userId }),
    ])

    const userTags = Array.from(new Set([...logTags, ...mealTags].filter((t: unknown) => typeof t === 'string')))
      .sort()

    return NextResponse.json({ defaults: DEFAULT_TAGS, userTags })
  } catch (error) {
    console.error('Error listing tags:', error)
    return NextResponse.json({ error: 'Failed to list tags' }, { status: 500 })
  }
}
