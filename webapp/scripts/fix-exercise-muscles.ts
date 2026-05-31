/**
 * Companion to audit-exercise-muscles.ts.
 *
 * Applies a curated allow-list of canonical muscle assignments (see
 * lib/exerciseMuscleFix.ts → MUSCLE_FIXES) to the Exercise collection. The
 * allow-list is the canonical correct value, not a delta — so the script is
 * idempotent: running twice produces the same end state as running once.
 *
 * Defaults to --dry-run. Pass --apply to actually write.
 *
 * Run from webapp/:
 *   DEV dry-run:   npx tsx scripts/fix-exercise-muscles.ts
 *   DEV apply:     npx tsx scripts/fix-exercise-muscles.ts --apply
 *   PROD dry-run:  npx tsx scripts/fix-exercise-muscles.ts --prod
 *   PROD apply:    npx tsx scripts/fix-exercise-muscles.ts --prod --apply
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local — same convention as sibling migrations.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import Exercise from '../models/Exercise'
import {
  MUSCLE_FIXES,
  computeFixDiff,
  formatDiff,
} from '../lib/exerciseMuscleFix'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const isApply = process.argv.includes('--apply')
const isDryRun = !isApply

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

async function main() {
  const label = `[${isProd ? 'PROD' : 'DEV'}${isDryRun ? ' DRY' : ' APPLY'}]`

  console.log(`${label} Connecting to MongoDB…`)
  await mongoose.connect(MONGODB_URI!)

  console.log(`${label} ${MUSCLE_FIXES.length} curated fixes in allow-list`)

  let unchanged = 0
  let changed = 0
  let written = 0
  let notFound = 0

  for (const fix of MUSCLE_FIXES) {
    const ex = await Exercise.findOne({ slug: fix.slug }).select(
      'slug primaryMuscles secondaryMuscles',
    )
    if (!ex) {
      console.log(`${label} ⚠ ${fix.slug}: not found in collection (skipping)`)
      notFound++
      continue
    }

    const diff = computeFixDiff(
      {
        primaryMuscles: ex.primaryMuscles || [],
        secondaryMuscles: ex.secondaryMuscles || [],
      },
      fix,
    )

    console.log(`${label} ${formatDiff(diff)}`)

    if (!diff.changed) {
      unchanged++
      continue
    }
    changed++

    if (isApply) {
      ex.primaryMuscles = fix.primaryMuscles
      ex.secondaryMuscles = fix.secondaryMuscles
      await ex.save()
      written++
    }
  }

  console.log(`${label} ───── Fix summary ─────`)
  console.log(`${label} fixes in allow-list:  ${MUSCLE_FIXES.length}`)
  console.log(`${label} unchanged (correct):  ${unchanged}`)
  console.log(`${label} changed:              ${changed}`)
  console.log(`${label} not found:            ${notFound}`)
  if (isApply) {
    console.log(`${label} writes:               ${written}`)
  } else {
    console.log(`${label} writes:               (dry-run, would have written ${changed})`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
