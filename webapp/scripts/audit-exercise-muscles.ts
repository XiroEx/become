/**
 * Audit: Exercise.primaryMuscles / secondaryMuscles data quality.
 *
 * Walks the canonical Exercise library and emits a CSV diff of three classes
 * of data issue (see lib/exerciseMuscleAudit.ts for the classifier definitions):
 *
 *   - MISSING_PRIMARY         — resistance category with no primaryMuscles
 *   - ANTAGONIST_CONTRADICTION — muscle outside the movement-pattern allow-list
 *   - CATEGORY_MISMATCH        — resistance category with primary=[full_body] only
 *
 * Pure read-only — no writes. Output goes to scripts/output/exercise-muscle-audit.csv.
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/audit-exercise-muscles.ts
 *   PROD: npx tsx scripts/audit-exercise-muscles.ts --prod
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local — same convention as sibling migrations.
 */

import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs'
import * as dotenv from 'dotenv'
import Exercise from '../models/Exercise'
import {
  auditExercise,
  issuesToCSV,
  type AuditableExercise,
  type AuditIssue,
} from '../lib/exerciseMuscleAudit'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

async function main() {
  const label = isProd ? '[PROD]' : '[DEV]'

  console.log(`${label} Connecting to MongoDB…`)
  await mongoose.connect(MONGODB_URI!)

  const rows = await Exercise.find(
    { isActive: true },
    {
      slug: 1,
      name: 1,
      category: 1,
      movementPatterns: 1,
      primaryMuscles: 1,
      secondaryMuscles: 1,
    },
  ).lean<AuditableExercise[]>()

  console.log(`${label} Scanning ${rows.length} active exercises…`)

  const allIssues: AuditIssue[] = []
  const byType: Record<string, number> = {
    MISSING_PRIMARY: 0,
    ANTAGONIST_CONTRADICTION: 0,
    CATEGORY_MISMATCH: 0,
  }

  for (const ex of rows) {
    const safe: AuditableExercise = {
      slug: ex.slug,
      name: ex.name,
      category: ex.category,
      movementPatterns: ex.movementPatterns || [],
      primaryMuscles: ex.primaryMuscles || [],
      secondaryMuscles: ex.secondaryMuscles || [],
    }
    const issues = auditExercise(safe)
    for (const issue of issues) {
      allIssues.push(issue)
      byType[issue.issueType] = (byType[issue.issueType] || 0) + 1
    }
  }

  const outDir = path.join(__dirname, 'output')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'exercise-muscle-audit.csv')
  fs.writeFileSync(outPath, issuesToCSV(allIssues))

  console.log(`${label} ───── Audit summary ─────`)
  console.log(`${label} exercises scanned:           ${rows.length}`)
  console.log(`${label} MISSING_PRIMARY:             ${byType.MISSING_PRIMARY}`)
  console.log(`${label} ANTAGONIST_CONTRADICTION:    ${byType.ANTAGONIST_CONTRADICTION}`)
  console.log(`${label} CATEGORY_MISMATCH:           ${byType.CATEGORY_MISMATCH}`)
  console.log(`${label} total issues:                ${allIssues.length}`)
  console.log(`${label} CSV written to:              ${path.relative(process.cwd(), outPath)}`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
