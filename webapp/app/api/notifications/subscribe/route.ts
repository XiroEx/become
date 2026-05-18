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
    const { endpoint, keys, platform = 'web' } = body

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })
    }
    if (platform === 'web' && (!keys?.p256dh || !keys?.auth)) {
      return NextResponse.json({ error: 'keys.p256dh and keys.auth required for web subscriptions' }, { status: 400 })
    }

    await dbConnect()

    // Upsert — replace any existing subscription at this endpoint (handles re-subscribes)
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId: authResult.userId, platform, endpoint, keys },
      { upsert: true, new: true },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving push subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
