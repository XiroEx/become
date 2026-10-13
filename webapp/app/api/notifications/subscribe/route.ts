import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import PushSubscription from '@/models/PushSubscription'
import UserProgress from '@/models/UserProgress'
import { notificationsAreEnabled } from '@/lib/push/notificationsToggle'
import { parseSubscribeBody } from '@/lib/push/subscribeBody'

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }

    // web: endpoint URL + keys. ios/android: the RAW device token (APNs hex /
    // FCM registration token), never an Expo push token (NP-063).
    const parsed = parseSubscribeBody(await request.json().catch(() => null))
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { endpoint, keys, platform, reenable, apnsEnvironment } = parsed

    await dbConnect()

    if (reenable === true) {
      // An explicit "turn notifications back on" action — the only path
      // allowed to flip the switch back. Background resync (PushSubscriptionSync,
      // Repair) never sends this, so it can never silently undo an opt-out.
      await UserProgress.updateOne({ userId: authResult.userId }, { $set: { notificationsEnabled: true } })
    } else {
      const progress = await UserProgress.findOne({ userId: authResult.userId })
        .select('notificationsEnabled')
        .lean()
      if (!notificationsAreEnabled(progress?.notificationsEnabled)) {
        return NextResponse.json({ error: 'notifications_disabled' }, { status: 409 })
      }
    }

    // Upsert — replace any existing subscription at this endpoint (handles
    // re-subscribes, and a phone that changes hands moves to the new member).
    const update: Record<string, unknown> = { userId: authResult.userId, platform, endpoint }
    const unset: Record<string, ''> = {}
    if (keys) update.keys = keys
    else unset.keys = ''
    if (apnsEnvironment) update.apnsEnvironment = apnsEnvironment
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      Object.keys(unset).length > 0 ? { $set: update, $unset: unset } : { $set: update },
      { upsert: true, new: true },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving push subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
