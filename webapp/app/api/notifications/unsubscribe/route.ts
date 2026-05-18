import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import PushSubscription from '@/models/PushSubscription'

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
      // Remove all subscriptions for this user
      await PushSubscription.deleteMany({ userId: authResult.userId })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing push subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
