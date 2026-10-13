import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const dotenv = require('dotenv')
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3')

// Clear the pointer when the photo it points at no longer exists.
//
// WHY IT EXISTS
//
// `profileIcon: 'custom'` means "draw User.avatarUrl", and for an upload that
// URL is `/api/blob/avatars/<userId>/<rand>.jpg` — a pointer at an object in
// the blob store. The pointer is in MongoDB and the object is in MinIO, so the
// two can part company: objects written before ~2026-06-21 are in neither
// bucket today, and the rows naming them are still saying `custom`. George's
// avatar (uploaded 2026-06-03) is exactly that, which is how the profile page
// came to show four broken images at once.
//
// components/Avatar.tsx now falls back to a neutral glyph instead of a broken
// image, so nobody SEES the breakage any more. This is the other half: a row
// that permanently names a missing object should stop claiming a photo at all,
// so the icon picker shows a real selection again and the member can simply
// upload a new one.
//
// WHAT IT TOUCHES, AND WHAT IT REFUSES TO
//
// A candidate is `profileIcon: 'custom'` with an avatarUrl under
// `/api/blob/`. Each one is HEADed against the bucket, and the row is repaired
// ONLY on a definitive "not found" (404 / NoSuchKey / NotFound). Any other
// outcome — a timeout, a 403, a bad credential, the endpoint being down — is
// reported and LEFT ALONE. That distinction is the whole safety property: a
// store that is merely unreachable would otherwise wipe every avatar in the
// database in one run.
//
// Remote avatars (a Google `lh3.googleusercontent.com` URL backfilled by
// lib/authBridge.ts) are not in the bucket and are never candidates — there is
// nothing here that could prove one dead.
//
// A repaired row gets `avatarUrl` unset and `profileIcon` reset to the default
// for its fitness goal, which is what onboarding gives a new member, rather
// than being left with nothing selected.
//
// IDEMPOTENT: the write re-asserts the exact avatarUrl it read, so a row the
// member fixed by re-uploading between the read and the write is skipped
// rather than clobbered, and a second run finds nothing.
//
//   DRY RUN:  node scripts/repair-dangling-avatars.mjs
//   APPLY:    node scripts/repair-dangling-avatars.mjs --apply
//   PROD:     node scripts/repair-dangling-avatars.mjs --prod --apply
//
// Reads MONGODB_URI (or PROD_MONGODB_URI / MONGODB_URI_PROD with --prod) and
// the S3_* blob settings from the environment, falling back to
// webapp/.env.local. Nothing is baked in. In production the blob settings live
// in redsecrets (BECOME_RUNTIME_CONFIG.blob), not in the container env — pass
// them explicitly for a --prod run.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')
const URI = PROD
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD)
  : process.env.MONGODB_URI

if (!URI) {
  console.error(`Missing ${PROD ? 'PROD_MONGODB_URI' : 'MONGODB_URI'}`)
  process.exit(1)
}

const BUCKET = process.env.S3_BUCKET
const ENDPOINT = process.env.S3_ENDPOINT
if (!BUCKET || !ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
  console.error('Missing S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY')
  process.exit(1)
}

// Mirrors GOAL_TO_ICON + defaultIconForGoal in lib/reward/icons.tsx. Kept in
// step by tests/unit/avatarRepairDefaults.test.ts, which fails the build if the
// app's mapping and this one ever disagree.
const GOAL_TO_ICON = {
  lose_weight: 'flame',
  gain_muscle: 'strength',
  improve_performance: 'bolt',
  general_health: 'heart',
  maintain: 'focus',
}
const FALLBACK_ICON = 'spark'

/** `/api/blob/avatars/<id>/<rand>.jpg` → `avatars/<id>/<rand>.jpg`. */
const BLOB_PREFIX = '/api/blob/'

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
})

/** 'missing' | 'present' | 'unknown' — 'unknown' is never repaired. */
async function objectState(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return { state: 'present' }
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode
    if (status === 404 || err?.name === 'NoSuchKey' || err?.name === 'NotFound') {
      return { state: 'missing' }
    }
    return { state: 'unknown', why: `${err?.name ?? 'Error'}${status ? ` (${status})` : ''}` }
  }
}

await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 })
const db = mongoose.connection.db

// A mistyped collection name would report "0 to fix" and read as a clean run.
const names = (await db.listCollections().toArray()).map((c) => c.name)
if (!names.includes('users')) {
  console.error("Collection 'users' not found in this database — refusing to report on nothing.")
  await mongoose.disconnect()
  process.exit(1)
}
const users = db.collection('users')

const equipped = await users.countDocuments({ profileIcon: 'custom' })
const SELECTOR = { profileIcon: 'custom', avatarUrl: { $regex: '^/api/blob/' } }
const remote = equipped - (await users.countDocuments(SELECTOR))

console.log(`\n${PROD ? 'PROD' : 'DEV'} — users with an equipped photo`)
console.log(`  profileIcon: 'custom' ..... ${equipped}`)
console.log(`  remote / non-blob URL ..... ${remote}   (left alone — not in this bucket)`)
console.log(`  bucket: ${BUCKET} @ ${ENDPOINT}`)

const dangling = []
const healthy = []
const indeterminate = []

const cursor = users.find(SELECTOR, { projection: { email: 1, avatarUrl: 1, 'profile.fitnessGoal': 1 } })
for await (const user of cursor) {
  const key = user.avatarUrl.slice(BLOB_PREFIX.length)
  const { state, why } = await objectState(key)
  const row = { _id: user._id, email: user.email ?? '(no email)', avatarUrl: user.avatarUrl, key }
  if (state === 'missing') {
    dangling.push({ ...row, icon: GOAL_TO_ICON[user.profile?.fitnessGoal] ?? FALLBACK_ICON })
  } else if (state === 'present') {
    healthy.push(row)
  } else {
    indeterminate.push({ ...row, why })
  }
}

console.log(`\n  of the blob-backed ones:`)
console.log(`    object present .......... ${healthy.length}   (left alone)`)
console.log(`    object MISSING .......... ${dangling.length}`)
console.log(`    could not be checked .... ${indeterminate.length}   (left alone)`)

if (dangling.length > 0) {
  console.log('\n  will clear avatarUrl and set profileIcon:')
  for (const d of dangling) console.log(`    ${d._id}  ${d.email}  ${d.key}  → ${d.icon}`)
}
if (indeterminate.length > 0) {
  console.log('\n  LEFT ALONE (the store did not say "not found" — never repaired on a maybe):')
  for (const d of indeterminate) console.log(`    ${d._id}  ${d.email}  ${d.key}  — ${d.why}`)
}

if (APPLY && dangling.length > 0) {
  const ops = dangling.map((d) => ({
    updateOne: {
      // Re-assert the exact URL that was found missing: a member who
      // re-uploaded between the read above and this write keeps their new
      // photo instead of having it cleared.
      filter: { _id: d._id, avatarUrl: d.avatarUrl },
      update: { $unset: { avatarUrl: '' }, $set: { profileIcon: d.icon, updatedAt: new Date() } },
    },
  }))
  const r = await users.bulkWrite(ops, { ordered: false })
  console.log(`\nAPPLIED — matched ${r.matchedCount}, modified ${r.modifiedCount}`)
  const left = await users.countDocuments(SELECTOR)
  console.log(`Re-check (expected ${healthy.length + indeterminate.length}): ${left}`)
} else {
  console.log(`\n${APPLY ? 'APPLIED — nothing to do' : '(dry-run) — pass --apply to write'}`)
}

await mongoose.disconnect()
