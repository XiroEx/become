import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import PushSubscription from '@/models/PushSubscription'
import UserProgress from '@/models/UserProgress'
import { notificationsAreEnabled } from '@/lib/push/notificationsToggle'
import { parseSubscribeBody } from '@/lib/push/subscribeBody'
import { webDeviceOSFromUserAgent } from '@/lib/push/webDeviceOS'
import {
  computeFreshEnablePrefUpdates,
} from '@/lib/push/notificationDefaults'

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

    const progress = await UserProgress.findOne({ userId: authResult.userId })
      .select('notificationPrefs notificationsEnabled')
      .lean()

    if (reenable === true) {
      // An explicit "turn notifications back on" action — the only path
      // allowed to flip the switch back. Background resync (PushSubscriptionSync,
      // Repair) never sends this, so it can never silently undo an opt-out.
      // On fresh enable / re-enable, ensure per-type prefs default ON (except dailyGlance),
      // without overwriting any existing explicit choices.
      const prefUpdates = computeFreshEnablePrefUpdates(progress?.notificationPrefs)
      await UserProgress.updateOne(
        { userId: authResult.userId },
        {
          $set: {
            notificationsEnabled: true,
            ...prefUpdates,
          },
        },
        { upsert: true },
      )
    } else {
      if (!notificationsAreEnabled(progress?.notificationsEnabled)) {
        return NextResponse.json({ error: 'notifications_disabled' }, { status: 409 })
      }

      // If user had no progress doc or never initialized preferences, ensure per-type
      // prefs default ON (except dailyGlance) on first subscription, preserving explicit choices.
      const prefUpdates = computeFreshEnablePrefUpdates(progress?.notificationPrefs)
      if (!progress || Object.keys(prefUpdates).length > 0 || progress.notificationsEnabled === undefined) {
        await UserProgress.updateOne(
          { userId: authResult.userId },
          {
            $set: {
              notificationsEnabled: true,
              ...prefUpdates,
            },
          },
          { upsert: true },
        )
      }
    }

    // Upsert — replace any existing subscription at this endpoint (handles
    // re-subscribes, and a phone that changes hands moves to the new member).
    const update: Record<string, unknown> = { userId: authResult.userId, platform, endpoint }
    const unset: Record<string, ''> = {}
    if (keys) update.keys = keys
    else unset.keys = ''
    if (apnsEnvironment) update.apnsEnvironment = apnsEnvironment

    if (platform === 'web') {
      // Classified once, at subscribe time (NP-205) — see lib/push/webDeviceOS.ts
      // for why a later re-parse of a possibly-different User-Agent is wrong.
      update.webOS = webDeviceOSFromUserAgent(request.headers.get('user-agent'))
      if (reenable === true) {
        // The one explicit path allowed to undo a mute a native registration
        // put on this row (see the native branch below) — background resync
        // never sends reenable:true, so it can never silently undo one.
        unset.mutedAt = ''
        unset.mutedReason = ''
      }
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      Object.keys(unset).length > 0 ? { $set: update, $unset: unset } : { $set: update },
      { upsert: true, new: true },
    )

    if (platform === 'ios' || platform === 'android') {
      // A native token just registered: the member now gets this reminder
      // from the phone directly. MUTE (never delete — ensureSubscription.ts's
      // resync would silently recreate a deleted row the next time that
      // browser tab reloads with permission still 'granted') every web
      // subscription whose browser runs the SAME os family, so sendPushToUser
      // stops sending it there too. webOS 'other' (classified at subscribe
      // time — an iPad, or any browser iOS/Android can't be told apart from)
      // is never matched here, and an undefined webOS (subscribed before
      // NP-205) is never matched either: a second device never loses a
      // reminder in this switch, even at the cost of an occasional duplicate.
      await PushSubscription.updateMany(
        { userId: authResult.userId, platform: 'web', webOS: platform, mutedAt: { $exists: false } },
        { $set: { mutedAt: new Date(), mutedReason: 'native_registered' } },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving push subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
