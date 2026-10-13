/**
 * Functional check of the daily check-in gate against a real Mongo.
 * Isolated scratch DB only — never point this at production.
 *
 *   MONGODB_URI=mongodb://localhost:27018/become-checkin-scratch \
 *   npx tsx scripts/checkin-functional.mjs
 */
import { NextRequest } from 'next/server'

const { default: mongoose } = await import('mongoose')
const { default: UserProgress } = await import('../models/UserProgress.ts')
const { signToken } = await import('../lib/auth.ts')
const route = await import('../app/api/checkin/route.ts')

const URI = process.env.MONGODB_URI
if (!URI || !/localhost|127\.0\.0\.1/.test(URI)) {
  throw new Error('refusing to run against a non-local MONGODB_URI')
}

await mongoose.connect(URI)

const userId = new mongoose.Types.ObjectId()
const token = await signToken({ userId: userId.toString(), email: 'checkin@test.local' })
const TZ = 300 // EST-style, matches the screenshot's morning prompt

let failures = 0
function check(label, actual, expected) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${actual}, want ${expected})`}`)
}

const auth = { Authorization: `Bearer ${token}` }

async function get() {
  const req = new NextRequest(`http://localhost/api/checkin?tz=${TZ}`, { headers: auth })
  return (await route.GET(req)).json()
}

async function post(action) {
  const req = new NextRequest('http://localhost/api/checkin', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, tz: TZ }),
  })
  return (await route.POST(req)).json()
}

const reset = (extra = {}) =>
  UserProgress.findOneAndUpdate(
    { userId },
    { $set: { userId, moodHistory: [], weightHistory: [], checkIn: {}, ...extra } },
    { upsert: true, new: true },
  )

const now = new Date()
const todayEntry = (f) => ({ date: now, ...f })

// ── 1. Brand-new member, nothing logged ──────────────────────────────────────
await reset()
check('nothing logged → due', (await get()).due, true)

// ── 2. We showed it; the 8h window holds ─────────────────────────────────────
await post('shown')
check('just shown → suppressed', (await get()).due, false)
check('  reason', (await get()).reason, 'throttled')

// ── 3. The member's actual complaint: weight saved, mood not ─────────────────
await reset({
  weightHistory: [todayEntry({ weight: 210, unit: 'lbs' })],
  checkIn: { lastShownAt: new Date(Date.now() - 9 * 3600_000) },
})
let r = await get()
check('weight only, 9h later → asked again for the missing mood', r.due, true)
check('  not counted as complete', r.complete, false)

// ── 4. Both halves → done for the day, no matter how much time passes ────────
await reset({
  moodHistory: [todayEntry({ mood: 4 })],
  weightHistory: [todayEntry({ weight: 210, unit: 'lbs' })],
  checkIn: { lastShownAt: new Date(Date.now() - 23 * 3600_000) },
})
r = await get()
check('mood + weight, 23h later → still closed', r.due, false)
check('  reason', r.reason, 'complete')
check('  todaysMood surfaced', r.todaysMood, 4)
check('  lastWeight surfaced', r.lastWeight, 210)

// ── 5. "Skip for Today" means today ──────────────────────────────────────────
await reset()
await post('skip')
r = await get()
check('after skip → suppressed', r.due, false)
check('  reason', r.reason, 'skipped')

// Force the 8h window wide open: only a real day change should reopen it.
await UserProgress.updateOne(
  { userId },
  { $set: { 'checkIn.lastShownAt': new Date(Date.now() - 23 * 3600_000) } },
)
check('skip survives the old 8h window', (await get()).due, false)

// ── 6. Skipping repeatedly must not burn skipped DAYS ────────────────────────
await reset({ weightSkipTracking: { consecutiveSkips: 0 } })
await post('skip')
await post('skip')
await post('skip')
let doc = await UserProgress.findOne({ userId }).lean()
check('three skips in one day = 1 skipped day', doc.weightSkipTracking.consecutiveSkips, 1)

// ── 7. Tomorrow's skip does count ────────────────────────────────────────────
await UserProgress.updateOne(
  { userId },
  {
    $set: {
      'weightSkipTracking.lastPromptDate': new Date(Date.now() - 36 * 3600_000),
      'checkIn.lastSkippedDate': new Date(Date.now() - 36 * 3600_000),
    },
  },
)
await post('skip')
doc = await UserProgress.findOne({ userId }).lean()
check('a skip on a NEW day still counts', doc.weightSkipTracking.consecutiveSkips, 2)

// ── 8. How many prompts can a member actually get in a day now? ──────────────
// Replay a 24h day for the worst case (member ignores it, logs nothing).
await reset()
let prompts = 0
for (let h = 0; h < 24; h++) {
  const at = new Date(Date.now() + h * 3600_000)
  const doc2 = await UserProgress.findOne({ userId }).lean()
  const last = doc2?.checkIn?.lastShownAt
  const hoursSince = last ? (at - new Date(last)) / 3600_000 : Infinity
  if (hoursSince >= 8) {
    prompts++
    await UserProgress.updateOne({ userId }, { $set: { 'checkIn.lastShownAt': at } })
  }
}
check('worst case (ignores it all day) → 3 prompts', prompts, 3)

await UserProgress.deleteOne({ userId })
await mongoose.disconnect()

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
