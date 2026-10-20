import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import User from '@/models/User'
import PushSubscription from '@/models/PushSubscription'
import { notificationsAreEnabled } from '@/lib/push/notificationsToggle'
import { DEFAULT_NOTIFICATION_PREFS, NOTIFICATION_PREF_KEYS } from '@/lib/push/notificationDefaults'

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const [progress, user, nativeDeviceCount] = await Promise.all([
      UserProgress.findOne({ userId: authResult.userId })
        .select('notificationPrefs notificationsEnabled')
        .lean(),
      User.findById(authResult.userId)
        .select('emailPreferences')
        .lean<{ emailPreferences?: { engagement?: boolean } } | null>(),
      // NP-205: any native device at all, not just this browser's muted row —
      // the Settings notice is "reminders come from the app" for the member,
      // regardless of which of their browsers happens to be open right now.
      PushSubscription.countDocuments({ userId: authResult.userId, platform: { $in: ['ios', 'android'] } }),
    ])

    // Every nudge defaults ON (undefined means "never touched the switch").
    // `dailyGlance` is the one exception and defaults OFF: it is a standing
    // daily card rather than a nudge, and it lands in the same morning as the
    // workout and Mind reminders, so it ships silent until someone asks for it.
    // See models/UserProgress.ts → notificationPrefs.dailyGlance.
    const defaults = { streakAtRisk: true, workoutReminder: true, mealReminder: true, reEngagement: true, chatMessage: true, mindReminder: true, goalNudge: true, superStreakAtRisk: true, checkInReminder: true, dailyGlance: false }
    const mergedPreferences: Record<string, boolean> = { ...defaults }
    if (progress?.notificationPrefs) {
      for (const key of NOTIFICATION_PREF_KEYS) {
        const val = (progress.notificationPrefs as Record<string, unknown>)[key]
        if (typeof val === 'boolean') {
          mergedPreferences[key] = val
        }
      }
    }

    return NextResponse.json({
      preferences: mergedPreferences,
      notificationsEnabled: notificationsAreEnabled(progress?.notificationsEnabled),
      // Email lives on User (lib/email.ts reads it there), push on UserProgress.
      // One endpoint for both so Settings makes one request. Absent = on.
      emailEngagement: user?.emailPreferences?.engagement !== false,
      // NP-205: at least one native (ios/android) device is registered —
      // Settings says reminders now come from the app instead of the browser.
      nativeAppActive: nativeDeviceCount > 0,
    })
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const allowed = ['streakAtRisk', 'workoutReminder', 'mealReminder', 'reEngagement', 'chatMessage', 'mindReminder', 'goalNudge', 'superStreakAtRisk', 'checkInReminder', 'dailyGlance']
    const updates: Record<string, boolean> = {}
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') updates[`notificationPrefs.${key}`] = body[key]
    }
    const emailEngagement = typeof body.emailEngagement === 'boolean' ? body.emailEngagement : undefined

    if (Object.keys(updates).length === 0 && emailEngagement === undefined) {
      return NextResponse.json({ error: 'No valid preferences provided' }, { status: 400 })
    }

    await dbConnect()
    if (Object.keys(updates).length > 0) {
      await UserProgress.updateOne({ userId: authResult.userId }, { $set: updates }, { upsert: true })
    }
    if (emailEngagement !== undefined) {
      await User.updateOne(
        { _id: authResult.userId },
        { $set: { 'emailPreferences.engagement': emailEngagement } },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
