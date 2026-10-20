import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import PushSubscription from '@/models/PushSubscription'
import UserProgress from '@/models/UserProgress'
import { notificationsAreEnabled } from '@/lib/push/notificationsToggle'
import { parseSubscribeBody } from '@/lib/push/subscribeBody'
import { classifyWebUserAgent } from '@/lib/push/webDeviceOS'
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
      update.webOS = classifyWebUserAgent(request.headers.get('user-agent'))
      // NP-205: only an explicit "turn it back on" action may undo a mute a
      // native token placed on this row — same rule as `notificationsEnabled`
      // above, and for the same reason: a background resync must never
      // silently re-enable something a deliberate switch turned off.
      if (reenable === true) {
        unset.mutedAt = ''
        unset.mutedReason = ''
      }
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      Object.keys(unset).length > 0 ? { $set: update, $unset: unset } : { $set: update },
      { upsert: true, new: true },
    )

    // NP-205: a native push token is one install on one phone. The moment it
    // registers, this member's web push subscriptions that are plausibly the
    // SAME phone — same OS family, never 'other' (desktop, and anything this
    // cannot confidently place, iPad included) — stop sending, so the member
    // does not get every reminder twice on it. Muted, not deleted: deleting
    // would be undone by PushSubscriptionSync re-creating the row from the
    // browser's still-live subscription object on the member's next page
    // load, with nothing server-side left to stop it recurring.
    if (platform === 'ios' || platform === 'android') {
      await PushSubscription.updateMany(
        { userId: authResult.userId, platform: 'web', webOS: platform, mutedAt: null },
        { $set: { mutedAt: new Date(), mutedReason: 'native_app_registered' } },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving push subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
