import UserProgress from '@/models/UserProgress'

// Process-local cache so we don't hammer Mongo with redundant writes when the
// same user makes many tz-aware requests in a single container's lifetime.
const recentlyCaptured = new Map<string, number>()
const TTL_MS = 60 * 60 * 1000

/**
 * Opportunistically record the caller's timezone offset (minutes, matching
 * Date.getTimezoneOffset()) on their UserProgress doc. Fire-and-forget — the
 * cron uses this to send notifications at a reasonable LOCAL hour instead of
 * a fixed UTC window.
 *
 * Skipped when the offset is unknown (NaN/undefined) or already captured for
 * this user in the last hour by this process.
 */
export function captureUserTimezone(userId: string, tzOffsetMinutes: number): void {
  if (!userId || !Number.isFinite(tzOffsetMinutes)) return
  // getTimezoneOffset is in [-840, 720] for real-world timezones; reject junk.
  if (tzOffsetMinutes < -1440 || tzOffsetMinutes > 1440) return

  const cached = recentlyCaptured.get(userId)
  if (cached !== undefined && cached === tzOffsetMinutes) {
    return
  }

  recentlyCaptured.set(userId, tzOffsetMinutes)
  // Trim cache so it doesn't grow unbounded across many users.
  if (recentlyCaptured.size > 5000) {
    const cutoff = Date.now() - TTL_MS
    for (const [k, v] of recentlyCaptured) {
      if (v < cutoff) recentlyCaptured.delete(k)
    }
  }

  UserProgress.updateOne(
    { userId },
    { $set: { timezoneOffset: tzOffsetMinutes } },
  ).catch(() => {
    // Fire-and-forget — drop the cache entry so we retry on the next call.
    recentlyCaptured.delete(userId)
  })
}
