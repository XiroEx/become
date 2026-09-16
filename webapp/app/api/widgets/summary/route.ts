/**
 * GET /api/widgets/summary?tz=  — everything a home-screen / lock-screen widget
 * needs to draw, in one request.
 *
 * One endpoint rather than five because a home screen refreshes all of its
 * widgets together: five separate calls would be five auth round-trips and five
 * copies of the same UserProgress read, on a background timeline, per member.
 * The client picks the widget it is drawing out of `widgets` by `key`.
 *
 * `tz` is optional here, unlike the in-app read endpoints. A widget extension
 * is not a browser and may have no cheap way to report an offset, so when it is
 * absent the member's stored zone decides the day (see resolveWidgetTzOffset).
 *
 * This is a READ. It writes nothing — no lastShownAt, no ensureGoals upsert —
 * because a background refresh that mutates state makes every derived number
 * depend on how many widgets someone happens to have installed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { loadWidgetFeed } from '@/lib/widgets/load'
import { WIDGET_REFRESH_SECONDS } from '@/lib/widgets/feed'
import {
  cacheGetJson,
  cacheSetJson,
  widgetFeedCacheKey,
  WIDGET_FEED_CACHE_TTL_SECONDS,
} from '@/lib/redis'

export const dynamic = 'force-dynamic'

const TZ_CLAMP = 840 // ±14h, matching lib/dayWindow

/** `tz` when the caller sent a usable one, else null — never a 0 default. */
function readOptionalTz(params: URLSearchParams): number | null {
  const raw = params.get('tz')
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.max(-TZ_CLAMP, Math.min(TZ_CLAMP, n))
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tz = readOptionalTz(request.nextUrl.searchParams)

    // Cache on the offset the CALLER named. A caller that named none shares the
    // resolved-from-zone entry under a stable key of its own, so the two do not
    // collide.
    const cacheKey = widgetFeedCacheKey(auth.userId, tz)
    const cached = await cacheGetJson<unknown>(cacheKey)
    if (cached !== null) return json(cached)

    await dbConnect()
    const feed = await loadWidgetFeed(auth.userId, tz)
    await cacheSetJson(cacheKey, feed, WIDGET_FEED_CACHE_TTL_SECONDS)

    return json(feed)
  } catch (error) {
    console.error('GET /api/widgets/summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function json(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      // Private: this is one member's day. `max-age` matches the widget's own
      // refresh cadence so a retry inside the same timeline entry is free.
      'Cache-Control': `private, max-age=${WIDGET_FEED_CACHE_TTL_SECONDS}`,
      // Advisory for a client that would rather read a header than the body.
      'X-Widget-Refresh-After': String(WIDGET_REFRESH_SECONDS),
    },
  })
}
