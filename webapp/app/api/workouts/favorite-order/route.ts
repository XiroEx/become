// PATCH /api/workouts/favorite-order — replaces the caller's
// favoriteSessionOrder array. The body's `order` is the FULL new order of
// favorited quick-session ids; drag-reorder in the Sessions list round-trips
// through here.

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import { verifyAuth } from '@/lib/auth'
import { validateFavoriteOrderPayload } from '@/lib/workoutSessions/validateFavoriteOrder'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const validated = validateFavoriteOrderPayload(body)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  try {
    await dbConnect()
    const existing = await UserProgress.findOne({ userId: auth.userId })
    if (existing) {
      await UserProgress.updateOne(
        { userId: auth.userId },
        { $set: { favoriteSessionOrder: validated.order } },
      )
    } else {
      await UserProgress.create({
        userId: auth.userId,
        favoriteSessionOrder: validated.order,
      })
    }
  } catch (err) {
    console.error('PATCH /api/workouts/favorite-order update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  return NextResponse.json({
    success: true,
    favoriteSessionOrder: validated.order,
  })
}
