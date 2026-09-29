'use client'

// Renders nothing. Reports this device's timezone to POST /api/me/timezone on
// the dashboard's first load, at most once per local day
// (lib/timezone/reportTimezone.ts owns the gate).
//
// Mounted in the dashboard layout next to PushSubscriptionSync and AppBadgeSync
// so it covers every protected route: the member this exists for is the one who
// opens straight into Nutrition, logs a meal and never touches a workout — the
// only route that used to record a zone was POST /api/workouts, so the notify
// cron skipped them entirely and their AI-estimate day was bucketed on UTC.

import { useEffect } from 'react'
import { reportTimezoneOnce } from '@/lib/timezone/reportTimezone'

export default function TimezoneSync() {
  useEffect(() => {
    void reportTimezoneOnce()
  }, [])

  return null
}
