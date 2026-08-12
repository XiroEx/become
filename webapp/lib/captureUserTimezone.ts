import UserProgress from '@/models/UserProgress'

// Process-local cache so we don't hammer Mongo with redundant writes when the
// same user makes many tz-aware requests in a single container's lifetime.
const recentlyCaptured = new Map<string, string>()
const TTL_MS = 60 * 60 * 1000

/**
 * Opportunistically record the caller's timezone offset (minutes, matching
 * Date.getTimezoneOffset()) on their UserProgress doc. Fire-and-forget — the
 * cron uses this to send notifications at a reasonable LOCAL hour instead of
 * a fixed UTC window.
 *
 * IMPORTANT: pass only a GENUINELY-reported offset. Callers must gate on
 * `readOptionalTzOffsetFromBody(body) !== null` — never feed the 0-default of
 * `readTzOffsetFromBody`, because persisting a fabricated 0 marks the user as
 * UTC and makes the cron fire their morning reminder at ~3am local.
 *
 * Skipped when the offset is unknown (NaN/undefined) or already captured for
 * this user in the last hour by this process.
 */
/** Reject junk before it reaches the DB: Intl throws on an unknown zone. */
function isValidZone(zone: string | undefined): zone is string {
  if (!zone || typeof zone !== 'string' || zone.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export function captureUserTimezone(userId: string, tzOffsetMinutes: number, ianaZone?: string): void {
  if (!userId || !Number.isFinite(tzOffsetMinutes)) return
  // getTimezoneOffset is in [-840, 720] for real-world timezones; reject junk.
  if (tzOffsetMinutes < -1440 || tzOffsetMinutes > 1440) return

  // A zone name is worth writing even when the offset has not moved, so the
  // cache key carries both. Otherwise the first member to be seen before this
  // feature existed would keep their offset and never gain a zone.
  const zone = isValidZone(ianaZone) ? ianaZone : undefined
  const key = `${tzOffsetMinutes}|${zone ?? ''}`
  const cached = recentlyCaptured.get(userId)
  if (cached !== undefined && cached === key) {
    return
  }

  recentlyCaptured.set(userId, key)
  // Trim so it doesn't grow unbounded across many users. The entries are cheap
  // and a dropped one only costs a redundant write, so clearing wholesale is
  // fine and avoids tracking an age per key.
  if (recentlyCaptured.size > 5000) recentlyCaptured.clear()

  UserProgress.updateOne(
    { userId },
    { $set: { timezoneOffset: tzOffsetMinutes, ...(zone ? { timezone: zone } : {}) } },
  ).catch(() => {
    // Fire-and-forget — drop the cache entry so we retry on the next call.
    recentlyCaptured.delete(userId)
  })
}
