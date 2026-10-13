/**
 * REPORT: custom exercises that say bodyweight but track weight.
 *
 * The create form used to default `trackingType: 'reps_weight'` and never
 * looked at the Bodyweight category chip or the 'bodyweight' equipment value
 * (card 2878931f) — so an exercise a member created as bodyweight came out
 * asking for a load in Live and Track. The form is fixed; everything created
 * before it is not.
 *
 * This is a REPORT, not a migration. It writes nothing: some of these are
 * deliberate ("Bodyweight" plus a dip belt is weighted dips), so the list
 * exists to be read and fixed one at a time from the My Exercises library, or
 * left alone on purpose.
 *
 * Classifier: lib/workout/bodyweightTracking.ts → isBodyweightTrackingMismatch.
 * The equivalent raw query, for a mongo shell:
 *
 *   db.exercises.find({
 *     isCustom: true,
 *     trackingType: 'reps_weight',
 *     $or: [{ category: 'calisthenics' }, { equipment: 'bodyweight' }],
 *   }, { slug: 1, name: 1, createdBy: 1, category: 1, equipment: 1, createdAt: 1 })
 *
 * ('calisthenics' is what the form's "Bodyweight" chip resolves to — see
 * CUSTOM_EXERCISE_CATEGORY_MAP in lib/customExerciseFields.ts.)
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/audit-bodyweight-tracking.ts
 *   PROD: npx tsx scripts/audit-bodyweight-tracking.ts --prod
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local — same convention as the sibling audits. Output goes to
 * stdout and to scripts/output/bodyweight-tracking-audit.csv.
 */

import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs'
import * as dotenv from 'dotenv'
import Exercise from '../models/Exercise'
import {
  BODYWEIGHT_EQUIPMENT,
  BODYWEIGHT_STORED_CATEGORY,
  findBodyweightTrackingMismatches,
  type AuditableCustomExercise,
} from '../lib/workout/bodyweightTracking'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

async function main() {
  const label = isProd ? '[PROD]' : '[DEV]'

  console.log(`${label} Connecting to MongoDB…`)
  await mongoose.connect(MONGODB_URI!)

  // Narrowed server-side to the same shape the classifier looks for, then
  // re-checked in code so the report and the form can never disagree about
  // what "says bodyweight" means.
  const rows = await Exercise.find(
    {
      isCustom: true,
      $or: [{ category: BODYWEIGHT_STORED_CATEGORY }, { equipment: BODYWEIGHT_EQUIPMENT }],
    },
    { slug: 1, name: 1, category: 1, equipment: 1, trackingType: 1, createdBy: 1, createdAt: 1 },
  ).lean<AuditableCustomExercise[]>()

  const mismatches = findBodyweightTrackingMismatches(rows)

  const outDir = path.join(__dirname, 'output')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'bodyweight-tracking-audit.csv')
  const header = 'slug,name,owner,signals,category,equipment,trackingType,createdAt'
  const lines = mismatches.map((ex) => [
    ex.slug,
    ex.name ?? '',
    ex.createdBy ?? '',
    ex.signals.join('+'),
    ex.category ?? '',
    (ex.equipment ?? []).join('|'),
    ex.trackingType ?? '',
    ex.createdAt ? new Date(ex.createdAt).toISOString() : '',
  ].map(csvCell).join(','))
  fs.writeFileSync(outPath, [header, ...lines].join('\n') + '\n')

  console.log(`${label} ───── Bodyweight tracking audit (read-only) ─────`)
  console.log(`${label} custom exercises that say bodyweight: ${rows.length}`)
  console.log(`${label} of those, still tracking weight:      ${mismatches.length}`)
  for (const ex of mismatches) {
    console.log(
      `${label}   ${ex.slug}  —  ${ex.name ?? '(no name)'}  ` +
      `[said by: ${ex.signals.join(' + ')}]  owner=${ex.createdBy ?? '?'}`,
    )
  }
  console.log(`${label} CSV written to: ${path.relative(process.cwd(), outPath)}`)
  console.log(`${label} Nothing was modified — fix or keep each one from My Exercises.`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
