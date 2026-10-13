/**
 * Audit: does every exercise's demo video show THAT exercise?
 *
 * Card: "Bug: Jumping Jacks shows a barbell bench-press image (Upper Body
 * Supersets + Core Circuit)" — acceptance: "A scan of the exercise library
 * finds no other image mismatches, or lists them."
 *
 * Two classes come out (see lib/exerciseDemoVideoScan.ts for the definitions
 * and lib/exerciseDemoVideo.ts for what the two stock clips actually show):
 *
 *   STOCK-CLIP  `/placeholder.mp4` (a barbell bench press) or
 *               `/placeholder2.mp4` (a goblet squat) attached to an unrelated
 *               exercise by an old seed script. The bug. Every read path
 *               refuses these, and app/api/cron/sync-exercise-catalog takes
 *               them off the rows — so a non-empty list here means that sync
 *               has not run yet.
 *   BORROWED    A clip filmed for a close variation and reused on purpose
 *               (`front-squat` → `back-squat.mov`). Listed for review, never
 *               changed automatically: which neighbour is close enough is the
 *               coach's call.
 *
 * Pure read-only — no writes.
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/audit-exercise-demo-videos.ts
 *   PROD: npx tsx scripts/audit-exercise-demo-videos.ts --prod
 *   REPO: npx tsx scripts/audit-exercise-demo-videos.ts --fixture
 *         (scans data/exercises.json, the snapshot the tests read, with no
 *          database at all)
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local — same convention as sibling audits.
 */

import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import Exercise from '../models/Exercise'
import {
  describeDemoVideoMismatch,
  scanExerciseDemoVideos,
  type ScannableExercise,
} from '../lib/exerciseDemoVideoScan'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const FIXTURE = process.argv.includes('--fixture')
const isProd = process.argv.includes('--prod')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

async function loadCatalog(): Promise<{ label: string; rows: ScannableExercise[] }> {
  if (FIXTURE) {
    const file = path.join(__dirname, '..', '..', 'data', 'exercises.json')
    return { label: '[REPO]', rows: JSON.parse(fs.readFileSync(file, 'utf8')) as ScannableExercise[] }
  }

  if (!MONGODB_URI) {
    console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
    process.exit(1)
  }

  const label = isProd ? '[PROD]' : '[DEV]'
  console.log(`${label} Connecting to MongoDB…`)
  await mongoose.connect(MONGODB_URI)
  const rows = await Exercise.find(
    {},
    { slug: 1, name: 1, aliases: 1, videoUrl: 1, _id: 0 }
  )
    .sort({ slug: 1 })
    .lean<ScannableExercise[]>()
  return { label, rows }
}

async function main() {
  const { label, rows } = await loadCatalog()
  console.log(`${label} Scanning ${rows.length} exercises…\n`)

  const mismatches = scanExerciseDemoVideos(rows)
  const stock = mismatches.filter((m) => m.kind === 'stock-clip')
  const borrowed = mismatches.filter((m) => m.kind === 'borrowed')

  console.log(`STOCK-CLIP (a demo of an unrelated lift): ${stock.length}`)
  for (const m of stock) console.log(`  ✗ ${describeDemoVideoMismatch(m)}`)
  if (stock.length === 0) console.log('  none — nothing shows footage of an unrelated exercise')

  console.log(`\nBORROWED (a close variation's clip, by hand): ${borrowed.length}`)
  for (const m of borrowed) console.log(`  · ${describeDemoVideoMismatch(m)}`)

  if (!FIXTURE) await mongoose.disconnect()

  // Non-zero exit for the class that is a bug, so this can gate something
  // later. `borrowed` is a listing, not a failure.
  if (stock.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
