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
 *
 * THE ONE ROUTE THAT ACCEPTS A WIDGETS TOKEN. An extension runs outside the app
 * and must not hold the member's 30-day session, so it carries a token whose
 * `scope: 'widgets'` claim is refused by every other route in the app
 * (verifyAuth is default-deny for scoped tokens). That token is long-lived, so
 * this is also the one place its `widgetTokenVersion` is checked against the
 * stored one — see lib/widgets/token.ts, and note the check sits BEFORE the
 * cache read, because a revoked token must not be able to read a warm entry.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, WIDGET_SCOPES } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { loadWidgetFeed } from '@/lib/widgets/load'
import { isWidgetAuthAccepted } from '@/lib/widgets/token'
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
    const auth = await verifyAuth(request, { allowScopes: WIDGET_SCOPES })
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Revocation. A widgets token is stateless and lives for months, so the
    // stored counter is the only thing that can end it: signing out in the app
    // or requesting deletion bumps it, and every token minted before that stops
    // being accepted here. Costs one indexed read by _id, and only for widget
    // callers — a member reading their own feed in the app pays nothing
    // (isWidgetAuthAccepted returns true for an unscoped session immediately).
    if (auth.scope === 'widgets') await dbConnect()
    if (!(await isWidgetAuthAccepted(auth))) {
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
