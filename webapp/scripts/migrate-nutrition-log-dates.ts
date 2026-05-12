/**
 * Migration: rewrite legacy NutritionLog.date to canonical UTC-midnight-of-local-YYYY-MM-DD.
 *
 * Background — PR #246/#247 (2026-05-12) changed `/api/nutrition/log` so it
 * keys NutritionLog rows by UTC midnight of the user's LOCAL YYYY-MM-DD. The
 * previous code path stored rows at UTC midnight of the UTC-current day. For
 * users in non-UTC zones logging during their evening, the legacy key drifts
 * forward by one calendar day, hiding the row from reads against the
 * canonical key.
 *
 * This script walks every NutritionLog row and, when we can infer the user's
 * local zone, rewrites `date` to the canonical key derived from that zone +
 * the row's `createdAt` (the wall-clock moment the row was first persisted).
 *
 * Zone inference is conservative: we only act when User.profile.timezone is
 * present. The current User schema does NOT define a timezone field — when it
 * lands, the script will start fixing rows automatically. Until then, every
 * row will be logged as "uncertain" and skipped, which is safe.
 *
 * Idempotent: rows already at the canonical key are left alone. Self-heal in
 * the GET handler also converges the dataset on its own; this script is for
 * bulk offline conversion.
 *
 * Run with:
 *   DRY (default):  npx tsx scripts/migrate-nutrition-log-dates.ts
 *   APPLY:          npx tsx scripts/migrate-nutrition-log-dates.ts --apply
 *   PROD DRY:       npx tsx scripts/migrate-nutrition-log-dates.ts --prod
 *   PROD APPLY:     npx tsx scripts/migrate-nutrition-log-dates.ts --prod --apply
 */

import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')

const PROD_MONGODB_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_MONGODB_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_MONGODB_URI : DEV_MONGODB_URI

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found')
  process.exit(1)
}

interface UserDoc {
  _id: mongoose.Types.ObjectId
  email?: string
  profile?: {
    // Optional — not currently in the User schema. When it lands, expected to
    // be an IANA zone name (e.g. "America/New_York"). We use Intl with that
    // zone to derive the offset at the relevant instant.
    timezone?: string
  }
}

interface NutritionLogDoc {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  date: Date
  createdAt?: Date
  updatedAt?: Date
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Compute the offset (in minutes, browser-style POSITIVE west of UTC) of a
// given IANA timezone at a given instant. Returns null if the zone is invalid.
function tzOffsetMinutesForZoneAt(zone: string, at: Date): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = fmt.formatToParts(at)
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
    const y = get('year')
    const mo = get('month')
    const d = get('day')
    const h = get('hour')
    const mi = get('minute')
    const s = get('second')
    if ([y, mo, d, h, mi, s].some(n => !Number.isFinite(n))) return null
    const asUtc = Date.UTC(y, mo - 1, d, h, mi, s)
    // local-as-utc - real-utc = offset (POSITIVE east). Flip sign for
    // browser-style (POSITIVE west).
    const offsetEast = (asUtc - at.getTime()) / 60_000
    return -offsetEast
  } catch {
    return null
  }
}

// Canonical key: UTC midnight of the user's local YYYY-MM-DD at `at`.
function canonicalDateKey(zone: string, at: Date): Date | null {
  const offset = tzOffsetMinutesForZoneAt(zone, at)
  if (offset == null) return null
  const shifted = new Date(at.getTime() - offset * 60_000)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const d = shifted.getUTCDate()
  return new Date(Date.UTC(y, m, d))
}

async function migrate() {
  console.log(`Running migration on ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} database`)
  console.log(`Mode: ${apply ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)'}`)
  if (isProd && apply) {
    console.log('WARNING: about to modify the PRODUCTION database!')
    console.log('Press Ctrl+C within 3 seconds to cancel...')
    await delay(3000)
  }

  console.log('Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI as string)
  console.log('Connected.')

  const db = mongoose.connection.db
  if (!db) {
    console.error('Database connection not established')
    process.exit(1)
  }

  const users = db.collection<UserDoc>('users')
  const nutritionLogs = db.collection<NutritionLogDoc>('nutritionlogs')

  let scanned = 0
  let alreadyCanonical = 0
  let uncertainNoZone = 0
  let uncertainBadZone = 0
  let wouldRewrite = 0
  let rewrote = 0
  let conflicts = 0

  // Cache user timezone lookups.
  const tzCache = new Map<string, string | null>()
  async function userZone(userId: mongoose.Types.ObjectId): Promise<string | null> {
    const key = userId.toString()
    if (tzCache.has(key)) return tzCache.get(key) ?? null
    const u = await users.findOne({ _id: userId }, { projection: { 'profile.timezone': 1 } })
    const zone = u?.profile?.timezone ?? null
    tzCache.set(key, zone)
    return zone
  }

  const cursor = nutritionLogs.find({})
  for await (const doc of cursor) {
    scanned++

    const zone = await userZone(doc.userId)
    if (!zone) {
      uncertainNoZone++
      if (uncertainNoZone <= 5) {
        console.log(`  uncertain (no timezone) — log _id=${doc._id} userId=${doc.userId}`)
      }
      continue
    }

    // The instant the row was first persisted is the best proxy we have for
    // "when the user was looking at their dashboard". `createdAt` is set by
    // Mongoose timestamps; fall back to `date` if missing (legacy rows).
    const instant = doc.createdAt ?? doc.date
    const canonical = canonicalDateKey(zone, instant)
    if (!canonical) {
      uncertainBadZone++
      console.log(`  uncertain (bad zone "${zone}") — log _id=${doc._id} userId=${doc.userId}`)
      continue
    }

    if (doc.date.getTime() === canonical.getTime()) {
      alreadyCanonical++
      continue
    }

    wouldRewrite++
    console.log(
      `  ${apply ? 'REWRITE' : 'WOULD REWRITE'} — _id=${doc._id} userId=${doc.userId} ` +
      `from=${doc.date.toISOString()} to=${canonical.toISOString()} zone=${zone}`
    )

    if (!apply) continue

    // Guard against the unique (userId, date) index: if a canonical row
    // already exists, skip rather than crash. Operators should reconcile by
    // hand (or extend this script to merge water+quickAdds).
    const collision = await nutritionLogs.findOne({ userId: doc.userId, date: canonical })
    if (collision && !collision._id.equals(doc._id)) {
      conflicts++
      console.log(
        `    conflict — canonical row already exists at _id=${collision._id}; skipping rewrite`
      )
      continue
    }

    await nutritionLogs.updateOne({ _id: doc._id }, { $set: { date: canonical } })
    rewrote++
  }

  console.log('\nMigration complete.')
  console.log(`  Scanned:                ${scanned}`)
  console.log(`  Already canonical:      ${alreadyCanonical}`)
  console.log(`  Uncertain (no zone):    ${uncertainNoZone}`)
  console.log(`  Uncertain (bad zone):   ${uncertainBadZone}`)
  console.log(`  ${apply ? 'Rewrote' : 'Would rewrite'}:        ${apply ? rewrote : wouldRewrite}`)
  if (apply) console.log(`  Conflicts (skipped):    ${conflicts}`)

  await mongoose.disconnect()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
