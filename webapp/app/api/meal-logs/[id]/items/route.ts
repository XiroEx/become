import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealLog from '@/models/MealLog'
import Food from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { resolveItemFromInput, MealItemInput } from '@/lib/mealItems'
import { bustTilesCache } from '@/lib/redis'

// POST: append a single item to an existing meal log (owner only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const log = await MealLog.findById(id)
    if (!log) {
      return NextResponse.json({ error: 'Meal log not found' }, { status: 404 })
    }
    if (log.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    let item
    try {
      item = await resolveItemFromInput(body as MealItemInput)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid item payload'
      console.error('[meal-logs items POST] item resolution failed:', message, '— payload:', JSON.stringify(body).slice(0, 1000))
      return NextResponse.json({ error: message }, { status: 400 })
    }

    log.items.push(item)
    await log.save()

    if (item.foodId) {
      await Food.updateOne({ _id: item.foodId }, { $inc: { usageCount: 1 } }).catch(() => null)
    }

    // Meal logs feed dashboard tiles — invalidate so they show immediately.
    await bustTilesCache(authResult.userId!)

    return NextResponse.json({ success: true, log }, { status: 201 })
  } catch (error) {
    console.error('Error appending meal log item:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to append item' }, { status: 500 })
  }
}
