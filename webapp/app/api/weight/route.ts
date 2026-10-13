import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { recordStreakActivity } from '@/lib/streak'
import { bustTilesCache } from '@/lib/redis'
import { toKg, type WeightUnit } from '@become/core'
import { checkGoalReached } from '@/lib/goals/reached'
import {
  readHealthImport,
  findEntryByExternalId,
  HEALTH_IMPORT_BACKDATE_WINDOW_DAYS,
} from '@/lib/healthImport'
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

    // Did a Health sample send this, or did the member type it? `null` is the
    // ordinary typed write every client makes today and behaves exactly as it
    // always has.
    const origin = readHealthImport(body)
    if (!origin.ok) {
      return NextResponse.json({ error: origin.error }, { status: 400 })
    }
    const imported = origin.origin

    if (imported) {
      // An import is a VALUE arriving, never a prompt being dismissed.
      if (skip || weight == null) {
        return NextResponse.json(
          { error: 'An imported sample must carry a weight' },
          { status: 400 },
        )
      }
      // THE DAY COMES FROM THE SAMPLE, NEVER FROM THE IMPORT. Without `date`
      // the entry would be keyed on the day the sync happened to run, so a
      // sample from last week would land today — the whole bug. Refused rather
      // than defaulted, because the wrong day looks exactly like the right one.
      if (body.date == null || body.date === '') {
        return NextResponse.json(
          { error: 'date is required for an imported sample' },
          { status: 400 },
        )
      }
    }

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
    //
    // An IMPORT reaches back further than the offline queue's week: a first
    // sync carries months of real weigh-ins off a smart scale, and those are
    // history rather than a delayed write.
    const entryDay = resolveEntryDay(
      body,
      tzOffset,
      imported ? { maxBackdateDays: HEALTH_IMPORT_BACKDATE_WINDOW_DAYS } : {},
    )
    if (!entryDay.ok) {
      return NextResponse.json({ error: entryDay.error }, { status: 400 })
    }
    const { dayKey: entryKey, date: entryDate, loggedAt, backdated } = entryDay

    // Did the MEMBER do this, here, today? Only that answers the weight prompt
    // and earns a streak day. A back-dated write says nothing about today, and
    // an imported sample says nothing about Become at all — the member weighed
    // themselves, and their scale told their phone.
    const memberAction = !backdated && !imported

    // Provenance stamped on whichever row this write lands on.
    const importFields = imported
      ? { source: imported.source, ...(imported.externalId ? { externalId: imported.externalId } : {}) }
      : {}

    // Find or create user progress
    let progress = await UserProgress.findOne({ userId: authResult.userId })

    // Did this request actually change the day's entry? A replay carrying an
    // older `loggedAt` than the value already stored does not.
    let applied = true

    // Was this request a re-import of a sample already in the history? Reported
    // back so the client's sync can tell "already had it" from "lost a race".
    let duplicate = false

    if (!progress) {
      // Create new progress record
      progress = await UserProgress.create({
        userId: authResult.userId,
        weightHistory: weight ? [{ date: entryDate, loggedAt, weight, unit, ...importFields, ...(bodyFat != null ? { bodyFat } : {}) }] : [],
        weightSkipTracking: {
          // The prompt is a TODAY event: a back-dated entry — or a sample the
          // member's scale sent while they were nowhere near Become — says
          // nothing about whether they have been asked, or have skipped, today.
          lastPromptDate: memberAction ? today : undefined,
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

        // Has this exact SAMPLE been imported before? Health re-offers the same
        // rows on every sync and the sample id is the only thing that
        // recognises one. A repeat is accepted — there is nothing for the
        // client to retry — and changes NOTHING: not the day's row, not a value
        // the member may since have corrected by hand, not the streak.
        duplicate = imported?.externalId
          ? findEntryByExternalId(progress.weightHistory, imported.externalId) >= 0
          : false

        if (duplicate) {
          applied = false
        } else {
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
              // The day's value now came from the sample, so the row carries
              // its id: the NEXT sync recognises it and leaves the day alone.
              if (imported) {
                progress.weightHistory[existingIndex].source = imported.source
                if (imported.externalId) {
                  progress.weightHistory[existingIndex].externalId = imported.externalId
                }
              }
            }
          } else {
            if (!progress.weightHistory) progress.weightHistory = []
            progress.weightHistory.push({ date: entryDate, loggedAt, weight, unit, ...importFields, ...(bodyFat != null ? { bodyFat } : {}) })
          }
        }

        // Reset skip tracking. Only a weigh-in the MEMBER made TODAY says they
        // are not skipping today; a back-dated one — or an imported sample,
        // which they did nothing in Become to produce — leaves the prompt state
        // alone.
        if (applied) {
          if (memberAction) {
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
    //
    // Nor does an IMPORTED sample, even one dated today: the streak is a record
    // of showing up in Become, and a smart scale syncing in the background is
    // not that. A member whose phone quietly kept the streak alive while they
    // never opened the app would be handed something they did not do.
    let streakResult = null
    if (!skip && weight && memberAction) {
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
      // False when a stale replay lost to a newer value for the same day, and
      // when an already-imported sample arrived again. The request still
      // succeeded — there is nothing for the client to retry.
      applied,
      // This exact Health sample was already in the history.
      ...(duplicate && { duplicate: true }),
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
