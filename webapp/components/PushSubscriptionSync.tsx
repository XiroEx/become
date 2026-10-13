'use client'

// Renders nothing. Mounted in the dashboard layout so it runs on EVERY
// protected route, not just the dashboard home — a member who opens straight
// into Nutrition or Calendar needs their device re-registered just as much as
// one who lands on the home tab.
//
// See lib/push/ensureSubscription.ts for what it reconciles and why the app
// previously had no way to recover a stale subscription at all.

import { useEffect } from 'react'
import { ensurePushSubscription } from '@/lib/push/ensureSubscription'

export default function PushSubscriptionSync() {
  useEffect(() => {
    ensurePushSubscription().catch(() => {})
  }, [])

  return null
}
