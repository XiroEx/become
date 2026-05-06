import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// DELETE /api/me/foods/[foodId]
//
// Removes the given foodId from the authenticated user's savedFoods array.
// Returns 404 if the food was not in the user's list.
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ foodId: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { foodId } = await params
    if (!mongoose.Types.ObjectId.isValid(foodId)) {
      return NextResponse.json({ error: 'Invalid foodId' }, { status: 400 })
    }

    await dbConnect()

    const result = await User.updateOne(
      { _id: authResult.userId, 'savedFoods.foodId': new mongoose.Types.ObjectId(foodId) },
      { $pull: { savedFoods: { foodId: new mongoose.Types.ObjectId(foodId) } } }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Food not in saved list' }, { status: 404 })
    }

    return NextResponse.json({ removed: true })
  } catch (error) {
    console.error('Error removing saved food:', error)
    return NextResponse.json({ error: 'Failed to remove saved food' }, { status: 500 })
  }
}
