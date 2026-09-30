'use client'

// Renders nothing. Keeps the number on the installed app's ICON in step with
// what the member still owes today — the home-screen half of the widgets Jon
// asked for, and the only part of it a web app can draw (see lib/widgets/badge.ts).
//
// Mounted in the dashboard layout next to PushSubscriptionSync, so it runs on
// every protected route: the member who opens straight into Nutrition, logs a
// meal and swipes away is exactly the one whose icon would otherwise stay wrong.
//
// Two refresh points, and no polling:
//   - mount (an app open), and
//   - the tab becoming visible again, which on an installed PWA is what
//     "reopened from the home screen" looks like.
// A timer would keep firing in a backgrounded tab for a number nobody can see;
// the service worker's push handler is what keeps the badge honest while the
// app is CLOSED.

import { useCallback, useEffect, useRef } from 'react'
import { getToken } from '@/lib/clientAuth'
import { applyAppBadge, badgeSupported } from '@/lib/widgets/badge'

/** Don't re-ask on every flick between apps. The feed itself is cached ~60s. */
const MIN_REFRESH_MS = 60_000

export default function AppBadgeSync() {
  const lastFetchedAt = useRef(0)
  const inFlight = useRef(false)

  const refresh = useCallback(async (force = false) => {
    // Nothing to draw on: skip the request entirely rather than fetch a number
    // this platform will throw away. Android and every desktop browser land here.
    if (!badgeSupported(typeof navigator === 'undefined' ? null : navigator)) return
    if (inFlight.current) return
    const now = Date.now()
    if (!force && now - lastFetchedAt.current < MIN_REFRESH_MS) return

    const token = getToken()
    if (!token) return

    inFlight.current = true
    try {
      const res = await fetch(`/api/widgets/summary?tz=${new Date().getTimezoneOffset()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const feed: { badgeCount?: unknown } = await res.json()
      if (typeof feed.badgeCount !== 'number') return
      lastFetchedAt.current = Date.now()
      await applyAppBadge(feed.badgeCount)
    } catch {
      // Offline, or signed out mid-flight. The badge keeps its last value,
      // which is a better lie than clearing a day the member still owes.
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refresh(true)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  return null
}
