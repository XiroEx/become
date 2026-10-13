import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import PushSubscription from '@/models/PushSubscription'
import UserProgress from '@/models/UserProgress'

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { endpoint } = body

    await dbConnect()

    if (endpoint) {
      // Remove specific subscription
      await PushSubscription.deleteOne({ userId: authResult.userId, endpoint })
    } else {
      // No endpoint = the user turned notifications off entirely: drop every
      // device's subscription and flip the master switch, so nothing (this
      // device's background resync included, see /api/notifications/subscribe)
      // can silently recreate one.
      await PushSubscription.deleteMany({ userId: authResult.userId })
      await UserProgress.updateOne({ userId: authResult.userId }, { $set: { notificationsEnabled: false } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing push subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
