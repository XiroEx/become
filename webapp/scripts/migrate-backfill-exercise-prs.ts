/**
 * Migration: backfill `exercisePRs` on every UserProgress.
 *
 * Context — before this migration, personal records were computed on every
 * GET request by walking the user's full workoutLogs. The POST save path now
 * persists PRs into a new `exercisePRs` subdoc array on UserProgress. This
 * script populates that field for every existing user by replaying their full
 * workout-log history through the same updatePRsForWorkout helper the live
 * write path uses — so backfilled records are bit-for-bit identical to what
 * the live path would have produced if it had been running all along.
 *
 * Idempotent: replays from logs every time and OVERWRITES exercisePRs with the
 * full computed result, so a second run on the same DB is a no-op.
 *
 * Run from webapp/:
 *   DEV:   npx tsx scripts/migrate-backfill-exercise-prs.ts
 *   PROD:  npx tsx scripts/migrate-backfill-exercise-prs.ts --prod
 *   DRY:   npx tsx scripts/migrate-backfill-exercise-prs.ts --dry-run
 *
 * Combine flags: `--prod --dry-run` to preview the prod run.
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local — same convention as sibling migrations.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import { computeExercisePRsFromLogs, type IExercisePR } from '../lib/exercisePRs'
import { diffUser, isBackfillNoop } from '../lib/backfillDiff'

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

interface RawWorkoutLog {
  date: Date | string
  programId?: string
  completed?: boolean
  exercises?: Array<{
    name: string
    exerciseSlug?: string
    sets?: Array<{ weight?: number | null; reps?: number | null; completed?: boolean }> | null
  }> | null
}

interface RawUserProgress {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  workoutLogs?: RawWorkoutLog[]
  exercisePRs?: IExercisePR[]
}

interface PerUserSummary {
  userId: string
  logsConsidered: number
  prRecordsBefore: number
  prRecordsAfter: number
  added: string[]      // exerciseSlugs that did not exist on the user before
  changed: string[]    // exerciseSlugs whose maxWeight/maxReps/maxE1RM differ
  unchanged: number
}

async function main() {
  const label = `[backfill-prs${isProd ? ':prod' : ':dev'}${isDryRun ? ':dry' : ''}]`
  console.log(`${label} connecting...`)
  await mongoose.connect(MONGODB_URI as string)

  // Use the raw collection so we don't depend on the Mongoose model picking up
  // the new schema field (the model HAS the field, but raw collection ops are
  // simpler here and avoid schema versioning concerns).
  const UserProgress = mongoose.connection.collection<RawUserProgress>('userprogresses')

  const cursor = UserProgress.find(
    { workoutLogs: { $exists: true, $type: 'array', $ne: [] } },
    { projection: { _id: 1, userId: 1, workoutLogs: 1, exercisePRs: 1 } },
  )

  const summaries: PerUserSummary[] = []
  let writes = 0
  let skipped = 0

  for await (const doc of cursor) {
    const logs = doc.workoutLogs ?? []
    const computed = computeExercisePRsFromLogs(logs)
    const diff = diffUser(doc.exercisePRs, computed)

    const summary: PerUserSummary = {
      userId: doc.userId?.toString() ?? doc._id.toString(),
      logsConsidered: logs.length,
      prRecordsBefore: (doc.exercisePRs ?? []).length,
      prRecordsAfter: computed.length,
      added: diff.added,
      changed: diff.changed,
      unchanged: diff.unchanged,
    }
    summaries.push(summary)

    if (isBackfillNoop(doc.exercisePRs, computed)) {
      skipped++
      continue
    }

    if (!isDryRun) {
      await UserProgress.updateOne(
        { _id: doc._id },
        { $set: { exercisePRs: computed, updatedAt: new Date() } },
      )
      writes++
    }
  }

  // Per-user report
  for (const s of summaries) {
    if (s.added.length === 0 && s.changed.length === 0 && s.prRecordsBefore === s.prRecordsAfter) {
      console.log(`${label} user ${s.userId}: logs=${s.logsConsidered} prs=${s.prRecordsAfter} (no changes)`)
    } else {
      console.log(
        `${label} user ${s.userId}: logs=${s.logsConsidered} ` +
        `prs ${s.prRecordsBefore}→${s.prRecordsAfter} ` +
        `(+${s.added.length} added, ${s.changed.length} changed, ${s.unchanged} unchanged)`,
      )
      if (s.added.length > 0) console.log(`${label}   added: ${s.added.slice(0, 10).join(', ')}${s.added.length > 10 ? '…' : ''}`)
      if (s.changed.length > 0) console.log(`${label}   changed: ${s.changed.slice(0, 10).join(', ')}${s.changed.length > 10 ? '…' : ''}`)
    }
  }

  console.log(`${label} ───────────────`)
  console.log(`${label} users seen: ${summaries.length}`)
  console.log(`${label} writes:     ${isDryRun ? `(dry-run, would have written ${summaries.length - skipped})` : writes}`)
  console.log(`${label} no-ops:     ${skipped}`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
