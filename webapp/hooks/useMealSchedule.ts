'use client'

/**
 * The member's meal-tag windows, fetched once and shared.
 *
 * Six separate screens had their own private copy of a hardcoded
 * `getDefaultTagForNow()` with the same if/else hour table pasted into each. A
 * per-user schedule cannot live in six places, so this is the one source, and
 * `defaultTagNow()` falls back to that same table when the member has scheduled
 * nothing covering the current minute — an untouched account behaves exactly as
 * it did before.
 *
 * Module-level cache rather than a context provider: the windows change on a
 * settings screen, not during a session, and several of these screens mount
 * independently (meal detail, recipe detail, scan history). A shared promise
 * means N mounts still make one request.
 */

import { useEffect, useState } from 'react'
import { getToken } from '@/lib/clientAuth'
import { defaultTagAt, minutesOfDay, type TagWindow } from '@/lib/nutrition/mealSchedule'

let cache: TagWindow[] | null = null
let inFlight: Promise<TagWindow[]> | null = null

async function load(): Promise<TagWindow[]> {
  if (cache) return cache
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const token = getToken()
      const res = await fetch('/api/nutrition/meal-schedule', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return []
      const data = await res.json().catch(() => null)
      const windows = Array.isArray(data?.windows) ? (data.windows as TagWindow[]) : []
      cache = windows
      return windows
    } catch {
      // An empty schedule is a valid state, so a failed fetch degrades to
      // app-wide defaults rather than blocking the screen.
      return []
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Drop the cache after the schedule is edited, so open screens pick it up. */
export function invalidateMealSchedule(): void {
  cache = null
  inFlight = null
}

export function useMealSchedule(): { windows: TagWindow[]; defaultTagNow: () => string } {
  const [windows, setWindows] = useState<TagWindow[]>(cache ?? [])

  useEffect(() => {
    let cancelled = false
    load().then(w => { if (!cancelled) setWindows(w) })
    return () => { cancelled = true }
  }, [])

  return {
    windows,
    // Read the clock at call time, not at render time: a picker opened at 10:59
    // and used at 11:01 should default to what is true when it is used.
    defaultTagNow: () => defaultTagAt(windows, minutesOfDay(new Date())),
  }
}
