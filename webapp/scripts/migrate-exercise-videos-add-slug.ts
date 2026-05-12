/**
 * Migration: backfill `slug` on every ExerciseVideo row.
 *
 * Context — before this migration, ExerciseVideo rows were keyed by
 * `exerciseName` (which was UNIQUE on the model). But `Exercise.name` is
 * NOT unique (only `Exercise.slug` is), so two exercises sharing a display
 * name would collide and overwrite each other on video upload. The schema
 * now stores `slug` as the unique key; this script populates it on legacy
 * rows.
 *
 * Strategy:
 *   - Walk every ExerciseVideo with `slug` unset.
 *   - For each row, find the matching Exercise by `name` (case-insensitive
 *     exact match), then by `aliases` if no name match.
 *   - On exactly one match, write the slug. On zero or >1 matches, log
 *     and skip — these are orphans the operator needs to resolve manually.
 *
 * IMPORTANT: this script is one-shot and must NOT be wired into any
 * automatic deploy hook. Run it once per environment (dev, prod) and
 * commit the log output for posterity.
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/migrate-exercise-videos-add-slug.ts
 *   PROD: npx tsx scripts/migrate-exercise-videos-add-slug.ts --prod
 *   DRY:  npx tsx scripts/migrate-exercise-videos-add-slug.ts --dry-run
 *
 * Combine flags: `--prod --dry-run` to preview the prod run.
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local — same convention as sibling migrations.
 *
 * Or pass it inline (handy for one-off prod runs where the URI is in a
 * secret store):
 *   PROD_MONGODB_URI="$(curl -s https://my.secret/store)" \
 *     npx tsx scripts/migrate-exercise-videos-add-slug.ts --prod
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const isDryRun = process.argv.includes('--dry-run')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface VideoDoc {
  _id: mongoose.Types.ObjectId
  exerciseName: string
  slug?: string | null
}

interface ExerciseDoc {
  _id: mongoose.Types.ObjectId
  slug: string
  name: string
  aliases?: string[]
}

async function main() {
  const label = `[migrate-videos-slug${isProd ? ':prod' : ':dev'}${isDryRun ? ':dry' : ''}]`
  console.log(`${label} connecting...`)
  await mongoose.connect(MONGODB_URI as string)

  const Videos = mongoose.connection.collection<VideoDoc>('exercisevideos')
  const Exercises = mongoose.connection.collection<ExerciseDoc>('exercises')

  const cursor = Videos.find({
    $or: [{ slug: { $exists: false } }, { slug: null }],
  })

  let resolved = 0
  let alreadyHadSlug = 0
  let multipleMatches = 0
  let noMatch = 0
  let scanned = 0

  for await (const video of cursor) {
    scanned += 1
    if (video.slug) {
      alreadyHadSlug += 1
      continue
    }

    const nameRegex = new RegExp(`^${escapeRegex(video.exerciseName)}$`, 'i')
    const matches = await Exercises.find({
      $or: [{ name: nameRegex }, { aliases: nameRegex }],
    })
      .project<{ slug: string; name: string }>({ slug: 1, name: 1 })
      .toArray()

    if (matches.length === 0) {
      noMatch += 1
      console.warn(
        `${label} ORPHAN: no Exercise matches video "${video.exerciseName}" (videoId=${video._id})`,
      )
      continue
    }

    if (matches.length > 1) {
      multipleMatches += 1
      console.warn(
        `${label} AMBIGUOUS: ${matches.length} exercises match video "${video.exerciseName}" ` +
          `(slugs=[${matches.map((m) => m.slug).join(', ')}], videoId=${video._id}) — skipping`,
      )
      continue
    }

    const slug = matches[0].slug
    if (isDryRun) {
      console.log(`${label} DRY: would set slug="${slug}" on ${video._id} ("${video.exerciseName}")`)
    } else {
      await Videos.updateOne({ _id: video._id }, { $set: { slug } })
      console.log(`${label} OK: ${video._id} ("${video.exerciseName}") -> slug="${slug}"`)
    }
    resolved += 1
  }

  console.log(
    `${label} done: scanned=${scanned} resolved=${resolved} ` +
      `alreadyHadSlug=${alreadyHadSlug} ambiguous=${multipleMatches} orphans=${noMatch}`,
  )

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('[migrate-videos-slug] failed:', err)
  try { await mongoose.disconnect() } catch { /* ignore */ }
  process.exit(1)
})
