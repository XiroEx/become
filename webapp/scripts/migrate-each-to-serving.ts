/**
 * Migration: legacy recipe-derived Food docs `servingUnit:'each'` → `'serving'`.
 *
 * The pre-PR-2 save-as-food handler minted recipe-derived Foods with the exact
 * triple `name='1 serving' AND servingUnit='each' AND servingSize=1`. PR 2
 * fixes the handler to write `'serving'`; this script flips existing rows.
 *
 * Idempotent — re-running matches zero docs after the first pass. The match
 * criteria are tight enough (the save-as-food handler is the only producer
 * of that exact shape) that we don't bother with a --dry-run flag.
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/migrate-each-to-serving.ts
 *   PROD: npx tsx scripts/migrate-each-to-serving.ts --prod
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local. Logs counts before/after and exits cleanly.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

const MATCH = {
  variants: {
    $size: 1,
    $elemMatch: {
      name: '1 serving',
      servingUnit: 'each',
      servingSize: 1,
    },
  },
}

async function main() {
  console.log(`[migrate-each-to-serving] connecting to ${isProd ? 'PROD' : 'DEV'}...`)
  await mongoose.connect(MONGODB_URI as string)

  const Food = mongoose.connection.collection('foods')

  const before = await Food.countDocuments(MATCH)
  console.log(`[migrate-each-to-serving] candidates: ${before}`)

  if (before === 0) {
    console.log('[migrate-each-to-serving] nothing to do.')
    await mongoose.disconnect()
    return
  }

  const result = await Food.updateMany(MATCH, {
    $set: { 'variants.$[v].servingUnit': 'serving' },
  }, {
    arrayFilters: [{
      'v.name': '1 serving',
      'v.servingUnit': 'each',
      'v.servingSize': 1,
    }],
  })

  const after = await Food.countDocuments(MATCH)
  console.log(
    `[migrate-each-to-serving] matched=${result.matchedCount} ` +
    `modified=${result.modifiedCount} remaining=${after}`,
  )

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('[migrate-each-to-serving] failed:', err)
  try { await mongoose.disconnect() } catch { /* ignore */ }
  process.exit(1)
})
