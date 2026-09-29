import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'
import { bustTilesCache } from '@/lib/redis'
import { toKg, type WeightUnit } from '@/lib/bodyUnits'
import { checkGoalReached } from '@/lib/goals/reached'
import {
  readTzOffset,
  readTzOffsetFromBody,
  localDateKey,
  dateKey,
  utcMidnightDateKey,
  isEntryOnDay,
  daysSinceEntry,
  resolveEntryDay,
  isStaleReplay,
} from '@/lib/dayWindow'

/**
 * Is `entryKey` (YYYY-MM-DD) the newest weigh-in day in the history? A
 * back-dated entry — last Tuesday's weight, delivered by the offline queue —
 * must not overwrite the profile's canonical weight or fire the goal-reached
 * check when a later weigh-in already exists. Entries are day markers, so they
 * are read at offset 0.
 */
function isNewestWeighIn(history: { date: Date }[] | undefined, entryKey: string): boolean {
  return !(history ?? []).some(e => dateKey(new Date(e.date), 0) > entryKey)
}

// Check if weight should be prompted and return skip info
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      // For unauthenticated users, don't prompt
      return NextResponse.json({
        needsWeightCheck: false,
        consecutiveSkips: 0,
        isMandatory: false,
        daysSinceLastEntry: 0
      })
    }

    await dbConnect()

    const progress = await UserProgress.findOne({ userId: authResult.userId }).lean()

    if (!progress) {
      return NextResponse.json({
        needsWeightCheck: true,
        consecutiveSkips: 0,
        isMandatory: false,
        daysSinceLastEntry: 999
      })
    }

    const tzOffset = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tzOffset)
    const tracking = progress.weightSkipTracking || { consecutiveSkips: 0 }

    // Weight rows and the skip-tracking dates are day-keyed (UTC-midnight
    // markers), so they are compared as calendar days. Reading them as instants
    // shifted them a day backwards for members west of UTC, which is why a
    // weight logged minutes ago still reported "1 day since last log".
    let daysSinceLastEntry = 999
    let lastWeight: number | null = null
    if (progress.weightHistory && progress.weightHistory.length > 0) {
      const newest = progress.weightHistory.reduce((a: { date: Date }, b: { date: Date }) =>
        new Date(b.date).getTime() > new Date(a.date).getTime() ? b : a
      )
      daysSinceLastEntry = daysSinceEntry(newest.date, todayKey, tzOffset) ?? 999
      lastWeight = (newest as { date: Date; weight: number }).weight
    }

    // Check if we already prompted today
    if (tracking.lastPromptDate) {
      if (isEntryOnDay(tracking.lastPromptDate, todayKey, tzOffset)) {
        // Already prompted today, don't show again
        return NextResponse.json({
          needsWeightCheck: false,
          consecutiveSkips: tracking.consecutiveSkips || 0,
          isMandatory: false,
          daysSinceLastEntry,
          lastWeight
        })
      }
    }

    // Check if weight was logged today
    const todaysWeight = progress.weightHistory?.find((entry: { date: Date }) =>
      isEntryOnDay(entry.date, todayKey, tzOffset)
    )

    if (todaysWeight) {
      return NextResponse.json({
        needsWeightCheck: false,
        consecutiveSkips: 0,
        isMandatory: false,
        daysSinceLastEntry: 0,
        lastWeight
      })
    }

    // Calculate consecutive skips
    let consecutiveSkips = tracking.consecutiveSkips || 0

    // Increment if we haven't prompted today and there's no weight entry
    if (tracking.lastPromptDate) {
      const daysSinceLastPrompt = daysSinceEntry(tracking.lastPromptDate, todayKey, tzOffset) ?? 0

      if (daysSinceLastPrompt >= 1) {
        consecutiveSkips = (tracking.consecutiveSkips || 0) + 1
      }
    }

    // Check if it's mandatory (14 days = 2 weeks)
    const isMandatory = consecutiveSkips >= 14

    // Check if we should show reminder (days 3, 7, 12, or mandatory)
    const shouldShowReminder = consecutiveSkips === 3 || consecutiveSkips === 7 || consecutiveSkips === 12 || isMandatory

    return NextResponse.json({
      needsWeightCheck: true, // Prompt daily if not already prompted today and no weight logged
      consecutiveSkips,
      isMandatory,
      showReminder: shouldShowReminder,
      daysSinceLastEntry,
      lastWeight
    })
  } catch (error) {
    console.error('Error checking weight:', error)
    return NextResponse.json({
      needsWeightCheck: false,
      consecutiveSkips: 0,
      isMandatory: false,
      daysSinceLastEntry: 0
    })
  }
}

// Log weight or skip
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { weight, skip, bodyFat } = body

    await dbConnect()

    // The log stores the raw number the member typed, which is only meaningful
    // alongside the unit they typed it in. Stamping the unit on the entry means
    // a member who switches lbs↔kg doesn't retroactively corrupt their history.
    let unit: WeightUnit = 'lbs'
    if (!skip && weight) {
      const user = await User.findById(authResult.userId).select('profile.weightUnit').lean()
      const saved = (user as { profile?: { weightUnit?: WeightUnit } } | null)?.profile?.weightUnit
      if (saved === 'kg' || saved === 'lbs') unit = saved
    }

    const tzOffset = readTzOffsetFromBody(body)
    const todayKey = localDateKey(null, tzOffset)
    const today = utcMidnightDateKey(todayKey)

    // Which local day this weigh-in belongs to. Without `date` on the body
    // that is today in the caller's offset — exactly what every client gets
    // now. With one, the client is telling us the day it was MADE on, which is
    // how a write queued offline before midnight and delivered after it still
    // lands on the day the member weighed themselves.
    const entryDay = resolveEntryDay(body, tzOffset)
    if (!entryDay.ok) {
      return NextResponse.json({ error: entryDay.error }, { status: 400 })
    }
    const { dayKey: entryKey, date: entryDate, loggedAt, backdated } = entryDay

    // Find or create user progress
    let progress = await UserProgress.findOne({ userId: authResult.userId })

    // Did this request actually change the day's entry? A replay carrying an
    // older `loggedAt` than the value already stored does not.
    let applied = true

    if (!progress) {
      // Create new progress record
      progress = await UserProgress.create({
        userId: authResult.userId,
        weightHistory: weight ? [{ date: entryDate, loggedAt, weight, unit, ...(bodyFat != null ? { bodyFat } : {}) }] : [],
        weightSkipTracking: {
          // The prompt is a TODAY event: a back-dated entry says nothing about
          // whether the member has been asked, or has skipped, today.
          lastPromptDate: backdated ? undefined : today,
          lastWeightDate: weight ? entryDate : undefined,
          consecutiveSkips: skip ? 1 : 0
        }
      })
    } else {
      // Initialize weightSkipTracking if it doesn't exist
      if (!progress.weightSkipTracking) {
        progress.weightSkipTracking = {
          consecutiveSkips: 0
        }
      }

      if (skip) {
        // A skip is a per-DAY event, not a per-press one. This used to increment
        // unconditionally, so dismissing the prompt three times in one day counted
        // as three skipped days — inflating the counter that drives the day-3/7/12
        // reminders and the 14-day mandatory weigh-in.
        const lastPrompt = progress.weightSkipTracking.lastPromptDate
        const alreadyCountedToday =
          lastPrompt && isEntryOnDay(lastPrompt, todayKey, tzOffset)
        if (!alreadyCountedToday) {
          progress.weightSkipTracking.consecutiveSkips = (progress.weightSkipTracking.consecutiveSkips || 0) + 1
        }
        progress.weightSkipTracking.lastPromptDate = today
      } else if (weight) {
        // User logged weight

        // Check if there's already an entry for the day this weigh-in belongs
        // to. Matched by calendar day — the local-instant window never matched
        // the day-keyed row, so a member west of UTC appended a new row on
        // every save instead of updating the day's entry.
        const existingIndex = progress.weightHistory?.findIndex((entry: { date: Date }) =>
          isEntryOnDay(entry.date, entryKey, tzOffset)
        ) ?? -1

        if (existingIndex >= 0) {
          // The same day can arrive twice — once from the device that was
          // online, once from an offline queue draining later. The later
          // DELIVERY is not necessarily the later WEIGH-IN, so the newer
          // `loggedAt` wins and the stale replay is accepted but ignored.
          if (isStaleReplay(progress.weightHistory[existingIndex].loggedAt, loggedAt)) {
            applied = false
          } else {
            progress.weightHistory[existingIndex].weight = weight
            progress.weightHistory[existingIndex].unit = unit
            progress.weightHistory[existingIndex].loggedAt = loggedAt
            if (bodyFat != null) progress.weightHistory[existingIndex].bodyFat = bodyFat
          }
        } else {
          if (!progress.weightHistory) progress.weightHistory = []
          progress.weightHistory.push({ date: entryDate, loggedAt, weight, unit, ...(bodyFat != null ? { bodyFat } : {}) })
        }

        // Reset skip tracking. Only a weigh-in for TODAY says the member is not
        // skipping today; a back-dated one leaves the prompt state alone.
        if (applied) {
          if (!backdated) {
            progress.weightSkipTracking.consecutiveSkips = 0
            progress.weightSkipTracking.lastPromptDate = today
          }
          if (isNewestWeighIn(progress.weightHistory, entryKey)) {
            progress.weightSkipTracking.lastWeightDate = entryDate
          }
        }
      }

      await progress.save()
    }

    // Only the newest weigh-in speaks for the member's CURRENT weight, so a
    // back-dated entry that an even later one already supersedes changes
    // nothing below it.
    const isCurrent = applied && isNewestWeighIn(progress.weightHistory, entryKey)

    // Keep the profile's canonical kg weight in step with the log.
    //
    // Calorie and protein targets are computed from profile.currentWeightKg. It
    // used to be written once during onboarding and never again, so a member who
    // dropped 15 lb was still being fed the macros for their starting weight —
    // the app quietly stopped matching the person using it.
    if (!skip && weight && isCurrent) {
      await User.findByIdAndUpdate(authResult.userId, {
        $set: { 'profile.currentWeightKg': toKg(weight, unit) },
      }).catch(() => null)
    }

    // Record streak activity when weight is actually logged (not skipped).
    //
    // A BACK-DATED entry does not touch the streak: recordStreakActivity only
    // ever credits the day it runs on, so replaying last Tuesday's weigh-in
    // would hand the member a streak day for today they did not earn. Past
    // streak days are left exactly as they were — the deliberate default.
    let streakResult = null
    if (!skip && weight && !backdated) {
      streakResult = await recordStreakActivity(authResult.userId!, authResult.email).catch(() => null)
    }

    // Did this weigh-in just cross into the goal's finish band for the first
    // time? Checked here, not on read, so the congratulations screen can fire
    // the moment it happens rather than whenever the member next opens a page
    // that computes goal progress.
    let goalReached = null
    if (!skip && weight && isCurrent) {
      goalReached = await checkGoalReached(authResult.userId!, toKg(weight, unit), unit).catch(() => null)
    }

    // Weight history feeds dashboard tiles — invalidate so it shows immediately.
    await bustTilesCache(authResult.userId!)

    return NextResponse.json({
      success: true,
      date: entryKey,
      // False only when a stale replay lost to a newer value for the same day.
      // The request still succeeded — there is nothing for the client to retry.
      applied,
      ...(streakResult && {
        streak: {
          streakDays: streakResult.streakDays,
          streakExtended: streakResult.streakExtended,
          newMilestone: streakResult.newMilestone,
        },
      }),
      ...(goalReached && { goalReached }),
    })
  } catch (error) {
    console.error('Error saving weight:', error)
    return NextResponse.json({ error: 'Failed to save weight' }, { status: 500 })
  }
}
