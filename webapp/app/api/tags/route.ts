import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal from '@/models/Meal'
import MealLog from '@/models/MealLog'
import MealTagSchedule from '@/models/MealTagSchedule'
import { verifyAuth } from '@/lib/auth'

const DEFAULT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    // The schedule is included because it is the only place a tag can exist
    // BEFORE anything is logged under it. Deriving the list purely from logs and
    // saved meals meant a tag you created was gone the moment you left the
    // screen — there was nowhere for an unused tag to live.
    const [logTags, mealTags, schedule] = await Promise.all([
      MealLog.distinct('tags', { user: authResult.userId }),
      Meal.distinct('tags', { createdBy: authResult.userId }),
      MealTagSchedule.findOne({ user: authResult.userId })
        .select('windows.tag')
        .lean<{ windows?: { tag: string }[] } | null>(),
    ])

    const scheduleTags = (schedule?.windows ?? []).map(w => w.tag)
    const userTags = Array.from(
      new Set([...logTags, ...mealTags, ...scheduleTags].filter((t: unknown) => typeof t === 'string')),
    ).sort()

    return NextResponse.json({ defaults: DEFAULT_TAGS, userTags })
  } catch (error) {
    console.error('Error listing tags:', error)
    return NextResponse.json({ error: 'Failed to list tags' }, { status: 500 })
  }
}
