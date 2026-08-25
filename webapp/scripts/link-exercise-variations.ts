/**
 * Exercise variation data audit — chest, back, shoulders, triceps, biceps,
 * quads, hamstrings, calves, glutes.
 *
 * Two operations, both additive and idempotent (see lib/exerciseVariationLinks.ts):
 *
 *   1. Insert NEW_VARIATION_EXERCISES — grip/equipment variants the catalog
 *      was missing outright. Skipped (not overwritten) if the slug already exists.
 *   2. Apply VARIATION_LINK_FIXES — append missing `variations[]` cross-links
 *      and drop superseded alias strings on exercises already in the catalog.
 *
 * Defaults to --dry-run. Pass --apply to actually write.
 *
 * Run from webapp/:
 *   DEV dry-run:   npx tsx scripts/link-exercise-variations.ts
 *   DEV apply:     npx tsx scripts/link-exercise-variations.ts --apply
 *   PROD dry-run:  npx tsx scripts/link-exercise-variations.ts --prod
 *   PROD apply:    npx tsx scripts/link-exercise-variations.ts --prod --apply
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local — same convention as sibling migrations.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import Exercise from '../models/Exercise'
import {
  VARIATION_LINK_FIXES,
  NEW_VARIATION_EXERCISES,
  computeVariationLinkDiff,
  formatVariationLinkDiff,
} from '../lib/exerciseVariationLinks'

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

  // ── Step 1: insert missing exercises ──────────────────────────────────────
  console.log(`${label} ${NEW_VARIATION_EXERCISES.length} candidate new exercises`)

  let inserted = 0
  let alreadyExists = 0

  for (const def of NEW_VARIATION_EXERCISES) {
    const existing = await Exercise.findOne({ slug: def.slug }).select('slug')
    if (existing) {
      console.log(`${label} ✓ ${def.slug} (already exists, skipping insert)`)
      alreadyExists++
      continue
    }
    console.log(`${label} + ${def.slug} — "${def.name}"`)
    if (isApply) {
      await Exercise.create(def)
      inserted++
    }
  }

  // ── Step 2: apply cross-link fixes ────────────────────────────────────────
  console.log(`${label} ${VARIATION_LINK_FIXES.length} curated link fixes`)

  let unchanged = 0
  let changed = 0
  let written = 0
  let notFound = 0

  for (const fix of VARIATION_LINK_FIXES) {
    const ex = await Exercise.findOne({ slug: fix.slug }).select('slug variations aliases')
    if (!ex) {
      console.log(`${label} ⚠ ${fix.slug}: not found in collection (skipping — insert step may not have run yet)`)
      notFound++
      continue
    }

    const diff = computeVariationLinkDiff(
      { variations: ex.variations || [], aliases: ex.aliases || [] },
      fix,
    )

    console.log(`${label} ${formatVariationLinkDiff(diff)}`)

    if (!diff.changed) {
      unchanged++
      continue
    }
    changed++

    if (isApply) {
      ex.variations = diff.nextVariations
      ex.aliases = diff.nextAliases
      await ex.save()
      written++
    }
  }

  console.log(`${label} ───── Summary ─────`)
  console.log(`${label} new exercises:        ${NEW_VARIATION_EXERCISES.length} (${alreadyExists} already existed)`)
  console.log(`${label} link fixes:           ${VARIATION_LINK_FIXES.length} (unchanged ${unchanged}, changed ${changed}, not found ${notFound})`)
  if (isApply) {
    console.log(`${label} inserted:             ${inserted}`)
    console.log(`${label} writes:               ${written}`)
  } else {
    console.log(`${label} (dry-run — would insert ${NEW_VARIATION_EXERCISES.length - alreadyExists}, write ${changed})`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
