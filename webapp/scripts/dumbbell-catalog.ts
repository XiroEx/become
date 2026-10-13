/**
 * Repair: the dumbbell version of a movement is its own exercise.
 *
 * Card "We need to have support for our dumbbell only program": nine
 * dumbbell exercises the two dumbbell-only programs prescribe had no row of
 * their own — the importer had attached the coach's wording to the nearest
 * barbell / machine / bodyweight row AS AN ALIAS, so nothing in the admin
 * portal was called any of them and a video uploaded there belonged to the
 * other lift. Three more (Dumbbell Swing, Dumbbell Hang Clean, Jumping Lunge)
 * were named inside the program's protocol blocks and were not in the catalog
 * at all. See lib/dumbbellCatalog.ts for the reviewed decision behind each.
 *
 * This script applies that table. Three things happen, in this order:
 *
 *   1. CATALOG — create the new rows, remove the moved alias from each host
 *      (leaving it there would make the new name ambiguous and resolve to
 *      NOTHING — see lib/exerciseNameMatch.ts), cross-link the pair as
 *      variations, rename Overhead Tricep Extension to say "Dumbbell", and
 *      spell "DB" out as "Dumbbell" across every name and alias in the
 *      catalog ("I'd rather switch them all to just say dumbbell").
 *
 *   2. PROGRAMS — repoint the two dumbbell-only programs at the new rows.
 *      Nothing outside them is touched: Step-Up stays a Step-Up in the BECOME
 *      program, and the At-Home program's Russian Twist stays the bodyweight
 *      one.
 *
 *   3. REPORT — what moved, and what was already done.
 *
 * MEMBER HISTORY IS DELIBERATELY NOT MIGRATED. This is not a relink of a
 * dangling slug (scripts/repair-program-exercises.ts, which does carry logs
 * and PRs across): every host row here is a real exercise that SIX other
 * programs still prescribe. Moving a member's `romanian-deadlift` PR onto
 * `dumbbell-romanian-deadlift` would be wrong for everyone squatting under a
 * barbell, and there is no way to tell from a log which program it came from.
 * Sets already logged stay where they are; sets logged from tomorrow land on
 * the dumbbell row.
 *
 * Idempotent. A second run finds nothing to do, and says so.
 *
 * THIS SCRIPT IS NO LONGER WHAT APPLIES THE CHANGE. The first round of this
 * card shipped a script and nobody ran it, so from the coach's side the pull
 * request changed nothing ("You didn't change anything. The exercises still
 * read with a DB."). The writer in production is now
 * `app/api/cron/sync-exercise-catalog`, called by
 * `.github/workflows/sync-exercise-catalog.yml` on every push to `main` and
 * daily after that. The database half of this script calls the same function
 * that route does (lib/dumbbellCatalogSync.ts), so it stays useful for a dry
 * run from a laptop and cannot drift from what production does.
 *
 * Run from webapp/:
 *   FIXTURE:  npx tsx scripts/dumbbell-catalog.ts --fixture
 *             rewrites ../data/exercises.json and ../data/programs.json,
 *             the repo's snapshot of the catalog. No database.
 *   DRY RUN:  npx tsx scripts/dumbbell-catalog.ts --prod
 *   APPLY:    npx tsx scripts/dumbbell-catalog.ts --prod --apply
 *
 * Without --prod it uses MONGODB_URI (the dev database). With --prod the
 * connection string comes from the BECOME_RUNTIME_CONFIG payload in
 * redsecrets when REDSECRETS_MONGODB_URI + SECRETS_ENCRYPTION_KEY are set —
 * that is what the live app reads — falling back to PROD_MONGODB_URI.
 */

import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import {
  buildDumbbellExerciseDoc,
  describeDumbbellCatalogPlan,
  isDumbbellCatalogSettled,
  isDumbbellProgramsSettled,
  planDumbbellCatalog,
  planDumbbellDetailSpellOuts,
  planDumbbellProgramRepoints,
  planDumbbellProgramTextSpellOuts,
  planDumbbellProtocolLabels,
  type CatalogRow,
  type DumbbellCatalogPlan,
  type ProgramLike,
} from '../lib/dumbbellCatalogPlan'
import { syncDumbbellCatalog } from '../lib/dumbbellCatalogSync'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')
const FIXTURE = process.argv.includes('--fixture')

const DATA_DIR = path.join(__dirname, '../../data')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

async function resolveUri(): Promise<string> {
  if (!PROD) {
    const uri = process.env.MONGODB_URI
    if (!uri) throw new Error('Missing MONGODB_URI')
    return uri
  }

  if (process.env.REDSECRETS_MONGODB_URI && process.env.SECRETS_ENCRYPTION_KEY) {
    const { MongoClient } = await import('mongodb')
    const { SecretsClient } = await import('@redbtn/redsecrets')
    const store = new MongoClient(process.env.REDSECRETS_MONGODB_URI)
    await store.connect()
    try {
      const secrets = new SecretsClient(store, {
        database: 'redshared',
        encryptionKey: process.env.SECRETS_ENCRYPTION_KEY,
      })
      const raw = await secrets.get({ name: 'BECOME_RUNTIME_CONFIG', appName: 'become', scope: 'global' })
      if (raw) {
        const payload = JSON.parse(raw)
        const uri = payload?.auth?.mongoUri
        if (uri) {
          console.log('database: from the redsecrets payload (the app’s own)')
          return uri
        }
      }
    } finally {
      await store.close()
    }
  }

  const uri = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
  if (!uri) throw new Error('Missing PROD_MONGODB_URI (and no redsecrets bootstrap in the environment)')
  console.log('database: from PROD_MONGODB_URI')
  return uri
}

function printPlan(
  plan: DumbbellCatalogPlan,
  repoints: ReturnType<typeof planDumbbellProgramRepoints>,
  details: ReturnType<typeof planDumbbellDetailSpellOuts>,
  texts: ReturnType<typeof planDumbbellProgramTextSpellOuts>,
  labels: ReturnType<typeof planDumbbellProtocolLabels>,
): void {
  const lines = describeDumbbellCatalogPlan(plan)
  console.log(`\n── CATALOG (${lines.length} change${lines.length === 1 ? '' : 's'}) ──`)
  for (const line of lines) console.log(`  ${line}`)
  if (lines.length === 0) console.log('  (nothing — already applied)')

  console.log(`\n── PROGRAMS (${repoints.length} reference${repoints.length === 1 ? '' : 's'}) ──`)
  for (const r of repoints) {
    console.log(`  ${r.programName ?? r.programId}  phase ${r.phaseIndex + 1} / workout ${r.workoutIndex + 1}: ${r.from} → ${r.to}`)
  }
  if (repoints.length === 0) console.log('  (nothing — already applied)')

  const textCount = details.length + texts.length + labels.length
  console.log(`\n── PROGRAM TEXT (${textCount} change${textCount === 1 ? '' : 's'}) ──`)
  for (const t of texts) {
    console.log(`  ${t.programId}.${t.field}  "${t.from}"`)
    console.log(`    → "${t.to}"`)
  }
  for (const d of details) {
    console.log(`  ${d.programName ?? d.programId}  "${d.from}"`)
    console.log(`    → "${d.to}"`)
  }
  for (const l of labels) {
    console.log(`  ${l.programName ?? l.programId}  ${l.slug}`)
    console.log(`    → name "${l.to}"`)
  }
  if (textCount === 0) console.log('  (nothing — already applied)')
}

/** Rewrite the repo's snapshot of the catalog and the programs. */
function runFixture(): void {
  const exercisesFile = path.join(DATA_DIR, 'exercises.json')
  const programsFile = path.join(DATA_DIR, 'programs.json')

  const catalog = JSON.parse(fs.readFileSync(exercisesFile, 'utf8')) as AnyRow[]
  const programs = JSON.parse(fs.readFileSync(programsFile, 'utf8')) as AnyRow[]

  const plan = planDumbbellCatalog(catalog as CatalogRow[])
  const repoints = planDumbbellProgramRepoints(programs as ProgramLike[])
  const details = planDumbbellDetailSpellOuts(programs as ProgramLike[])
  const texts = planDumbbellProgramTextSpellOuts(programs as ProgramLike[])
  const labels = planDumbbellProtocolLabels(programs as ProgramLike[])
  printPlan(plan, repoints, details, texts, labels)

  if (plan.missingSlugs.length > 0) {
    throw new Error(`the table names slugs the catalog does not hold: ${plan.missingSlugs.join(', ')}`)
  }

  const bySlug = new Map(catalog.map((row) => [row.slug as string, row]))

  for (const create of plan.creates) {
    catalog.push(buildDumbbellExerciseDoc(create.slug, create.create))
  }
  for (const edit of plan.hostEdits) {
    const row = bySlug.get(edit.slug)
    if (!row) continue
    const removed = new Set(edit.removeAliases)
    const removedEquipment = new Set(edit.removeOptionalEquipment)
    row.aliases = ((row.aliases ?? []) as string[]).filter((a) => !removed.has(a))
    row.optionalEquipment = ((row.optionalEquipment ?? []) as string[]).filter((e) => !removedEquipment.has(e))
    row.variations = [...((row.variations ?? []) as string[]), ...edit.addVariations]
  }
  for (const rename of plan.renames) {
    const row = bySlug.get(rename.slug)
    if (!row) continue
    row.name = rename.to
    row.aliases = [...((row.aliases ?? []) as string[]), ...rename.addAliases]
  }
  for (const spell of plan.spellOuts) {
    const row = bySlug.get(spell.slug)
    if (!row) continue
    if (spell.name) row.name = spell.name.to
    if (spell.aliases) row.aliases = spell.aliases.to
  }

  for (const r of repoints) {
    const program = programs.find((p) => p.program_id === r.programId)
    const entry = program?.phases?.[r.phaseIndex]?.workouts?.[r.workoutIndex]?.exercises?.[r.exerciseIndex]
    if (entry && entry.exerciseSlug === r.from) entry.exerciseSlug = r.to
  }

  for (const d of details) {
    const program = programs.find((p) => p.program_id === d.programId)
    const entry = program?.phases?.[d.phaseIndex]?.workouts?.[d.workoutIndex]?.exercises?.[d.exerciseIndex]
    if (entry && entry.details === d.from) entry.details = d.to
  }

  for (const l of labels) {
    const program = programs.find((p) => p.program_id === l.programId)
    const entry = program?.phases?.[l.phaseIndex]?.workouts?.[l.workoutIndex]?.exercises?.[l.exerciseIndex]
    if (entry && entry.exerciseSlug === l.slug) entry.name = l.to
  }

  for (const t of texts) {
    const program = programs.find((p) => p.program_id === t.programId)
    if (program && program[t.field] === t.from) program[t.field] = t.to
  }

  // Same shape the reconcile dump writes: two-space indent, no trailing
  // newline, rows left in the order they are already in.
  fs.writeFileSync(exercisesFile, JSON.stringify(catalog, null, 2))
  fs.writeFileSync(programsFile, JSON.stringify(programs, null, 2))

  const after = planDumbbellCatalog(catalog as CatalogRow[])
  if (!isDumbbellCatalogSettled(after) || !isDumbbellProgramsSettled(programs as ProgramLike[])) {
    throw new Error('the fixture is still not settled after one pass — the plan is not a fixed point')
  }
  console.log('\nwrote data/exercises.json and data/programs.json — re-planning finds nothing left.')
}

async function runDatabase(): Promise<void> {
  const uri = await resolveUri()
  await mongoose.connect(uri)
  console.log(`connected to ${mongoose.connection.name} — ${APPLY ? 'APPLY' : 'DRY RUN'}`)

  // The SAME function app/api/cron/sync-exercise-catalog runs, so a dry run
  // from a laptop and the scheduled production run can never disagree about
  // what is outstanding.
  const report = await syncDumbbellCatalog({ apply: APPLY })
  console.log(`${report.exercises} catalog exercises, ${report.programs} programs`)

  console.log(`\n── CATALOG (${report.plan.length} change${report.plan.length === 1 ? '' : 's'}) ──`)
  for (const line of report.plan) console.log(`  ${line}`)
  if (report.plan.length === 0) console.log('  (nothing — already applied)')

  console.log(`\n── PROGRAMS (${report.repoints.length} reference${report.repoints.length === 1 ? '' : 's'}) ──`)
  for (const line of report.repoints) console.log(`  ${line}`)
  if (report.repoints.length === 0) console.log('  (nothing — already applied)')

  console.log(`\n── PROGRAM TEXT (${report.programText.length} change${report.programText.length === 1 ? '' : 's'}) ──`)
  for (const line of report.programText) console.log(`  ${line}`)
  if (report.programText.length === 0) console.log('  (nothing — already applied)')

  if (report.missingSlugs.length > 0) {
    console.error(`\n!! the table names slugs the catalog does not hold: ${report.missingSlugs.join(', ')}`)
  }

  if (APPLY) {
    console.log('\n── written ──')
    for (const [what, slugs] of Object.entries(report.wrote)) {
      if (slugs.length > 0) console.log(`  ${what}: ${slugs.join(', ')}`)
    }
  } else if (!report.settled) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply, or just merge: the')
    console.log('workflow .github/workflows/sync-exercise-catalog.yml applies it on push to main.')
  }

  console.log(report.settled ? '\nDone — a second run would find nothing.' : '\n!! still not settled — re-run and read the plan.')

  await mongoose.disconnect()
}

async function main(): Promise<void> {
  if (FIXTURE) {
    runFixture()
    return
  }
  await runDatabase()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
