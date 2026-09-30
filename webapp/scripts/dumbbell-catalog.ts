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
import Exercise from '../models/Exercise'
import Program from '../models/Program'
import {
  describeDumbbellCatalogPlan,
  isDumbbellCatalogSettled,
  normalizeAliases,
  planDumbbellCatalog,
  planDumbbellDetailSpellOuts,
  planDumbbellProgramRepoints,
  type CatalogRow,
  type DumbbellCatalogPlan,
  type ProgramLike,
} from '../lib/dumbbellCatalogPlan'

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

/**
 * The document body for one of the table's new rows. Keys are ordered the way
 * `data/exercises.json` orders them (slug first, then alphabetical) so the
 * fixture this also writes stays readable next to the rows already in it.
 *
 * No `videoUrl`, on purpose, unless the table names a demo that was already
 * recorded for this exact movement (`create.video`). An exercise with no video
 * is what the admin portal's "No Video" tab lists, and that tab is the queue of
 * exercises waiting for a recording (see lib/exerciseAutoCatalog.ts).
 */
function buildRow(slug: string, create: AnyRow): AnyRow {
  return {
    slug,
    aliases: normalizeAliases(create.name, create.aliases ?? []),
    alternatives: [],
    bodyRegion: create.bodyRegion,
    cardioMetrics: null,
    category: create.category,
    commonMistakes: create.commonMistakes ?? [],
    cues: create.cues ?? [],
    defaultDuration: null,
    defaultReps: create.defaultReps ?? null,
    defaultRest: create.defaultRest ?? null,
    defaultSets: create.defaultSets ?? null,
    defaultTempo: null,
    description: create.description ?? '',
    difficulty: create.difficulty,
    equipment: create.equipment ?? [],
    instructions: create.instructions ?? [],
    isActive: true,
    laterality: create.laterality,
    mechanics: create.mechanics,
    movementPatterns: create.movementPatterns ?? [],
    name: create.name,
    optionalEquipment: [],
    prerequisites: [],
    primaryMuscles: create.primaryMuscles ?? [],
    role: create.role,
    secondaryMuscles: create.secondaryMuscles ?? [],
    stabilizers: create.stabilizers ?? [],
    tags: create.tags ?? [],
    ...(create.video ? { thumbnailUrl: create.video.thumbnailUrl } : {}),
    trackingType: create.trackingType,
    variations: create.variations ?? [],
    ...(create.video ? { videoUrl: create.video.videoUrl } : {}),
  }
}

function printPlan(
  plan: DumbbellCatalogPlan,
  repoints: ReturnType<typeof planDumbbellProgramRepoints>,
  details: ReturnType<typeof planDumbbellDetailSpellOuts>,
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

  console.log(`\n── PROGRAM TEXT (${details.length} protocol block${details.length === 1 ? '' : 's'}) ──`)
  for (const d of details) {
    console.log(`  ${d.programName ?? d.programId}  "${d.from}"`)
    console.log(`    → "${d.to}"`)
  }
  if (details.length === 0) console.log('  (nothing — already applied)')
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
  printPlan(plan, repoints, details)

  if (plan.missingSlugs.length > 0) {
    throw new Error(`the table names slugs the catalog does not hold: ${plan.missingSlugs.join(', ')}`)
  }

  const bySlug = new Map(catalog.map((row) => [row.slug as string, row]))

  for (const create of plan.creates) {
    catalog.push(buildRow(create.slug, create.create))
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

  // Same shape the reconcile dump writes: two-space indent, no trailing
  // newline, rows left in the order they are already in.
  fs.writeFileSync(exercisesFile, JSON.stringify(catalog, null, 2))
  fs.writeFileSync(programsFile, JSON.stringify(programs, null, 2))

  const after = planDumbbellCatalog(catalog as CatalogRow[])
  const afterRepoints = planDumbbellProgramRepoints(programs as ProgramLike[])
  const afterDetails = planDumbbellDetailSpellOuts(programs as ProgramLike[])
  if (!isDumbbellCatalogSettled(after) || afterRepoints.length > 0 || afterDetails.length > 0) {
    throw new Error('the fixture is still not settled after one pass — the plan is not a fixed point')
  }
  console.log('\nwrote data/exercises.json and data/programs.json — re-planning finds nothing left.')
}

async function runDatabase(): Promise<void> {
  const uri = await resolveUri()
  await mongoose.connect(uri)
  console.log(`connected to ${mongoose.connection.name} — ${APPLY ? 'APPLY' : 'DRY RUN'}`)

  const catalog = await Exercise.find(
    {},
    { slug: 1, name: 1, aliases: 1, variations: 1, optionalEquipment: 1, _id: 0 },
  ).sort({ slug: 1 }).lean() as unknown as CatalogRow[]
  const programs = await Program.find({}).lean() as unknown as AnyRow[]
  console.log(`${catalog.length} catalog exercises, ${programs.length} programs`)

  const plan = planDumbbellCatalog(catalog)
  const repoints = planDumbbellProgramRepoints(programs as ProgramLike[])
  const details = planDumbbellDetailSpellOuts(programs as ProgramLike[])
  printPlan(plan, repoints, details)

  if (plan.missingSlugs.length > 0) {
    console.error(`\n!! the table names slugs the catalog does not hold: ${plan.missingSlugs.join(', ')}`)
  }

  if (isDumbbellCatalogSettled(plan) && repoints.length === 0 && details.length === 0) {
    console.log('\nNothing to do.')
    await mongoose.disconnect()
    return
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.')
    await mongoose.disconnect()
    return
  }

  console.log('\n── applying ──')

  for (const create of plan.creates) {
    try {
      await Exercise.create(buildRow(create.slug, create.create))
      console.log(`  created ${create.slug} ("${create.create.name}")`)
    } catch (error) {
      // A concurrent run got there first; the unique index on `slug` settles it.
      if ((error as { code?: number })?.code !== 11000) throw error
      console.log(`  ${create.slug} already there`)
    }
  }

  for (const edit of plan.hostEdits) {
    const pull: AnyRow = {}
    if (edit.removeAliases.length > 0) pull.aliases = { $in: edit.removeAliases }
    if (edit.removeOptionalEquipment.length > 0) pull.optionalEquipment = { $in: edit.removeOptionalEquipment }
    const update: AnyRow = {}
    if (Object.keys(pull).length > 0) update.$pull = pull
    if (edit.addVariations.length > 0) update.$addToSet = { variations: { $each: edit.addVariations } }
    await Exercise.updateOne({ slug: edit.slug }, update)
    console.log(
      `  ${edit.slug}: -${edit.removeAliases.length} alias, -${edit.removeOptionalEquipment.length} optionalEquipment, +${edit.addVariations.length} variation`,
    )
  }

  for (const rename of plan.renames) {
    await Exercise.updateOne(
      { slug: rename.slug },
      { $set: { name: rename.to }, ...(rename.addAliases.length ? { $addToSet: { aliases: { $each: rename.addAliases } } } : {}) },
    )
    console.log(`  ${rename.slug}: "${rename.from}" → "${rename.to}"`)
  }

  for (const spell of plan.spellOuts) {
    const set: AnyRow = {}
    if (spell.name) set.name = spell.name.to
    if (spell.aliases) set.aliases = spell.aliases.to
    await Exercise.updateOne({ slug: spell.slug }, { $set: set })
    console.log(`  ${spell.slug}: spelled out`)
  }

  // Programs: the whole `phases` array is written back per program — the
  // entries are three levels deep and a positional update cannot reach them.
  const touched = new Set<string>()
  for (const r of repoints) {
    const program = programs.find((p) => p.program_id === r.programId)
    const entry = program?.phases?.[r.phaseIndex]?.workouts?.[r.workoutIndex]?.exercises?.[r.exerciseIndex]
    if (!program || !entry || entry.exerciseSlug !== r.from) continue
    entry.exerciseSlug = r.to
    touched.add(String(program.program_id))
  }
  for (const d of details) {
    const program = programs.find((p) => p.program_id === d.programId)
    const entry = program?.phases?.[d.phaseIndex]?.workouts?.[d.workoutIndex]?.exercises?.[d.exerciseIndex]
    if (!program || !entry || entry.details !== d.from) continue
    entry.details = d.to
    touched.add(String(program.program_id))
  }
  for (const programId of touched) {
    const program = programs.find((p) => String(p.program_id) === programId)
    if (!program) continue
    await Program.updateOne({ _id: program._id }, { $set: { phases: program.phases } })
    console.log(`  rewrote ${String(program.name)}`)
  }

  // Re-plan against what is now in the database: the run is only done if a
  // second pass would find nothing.
  const after = await Exercise.find(
    {},
    { slug: 1, name: 1, aliases: 1, variations: 1, optionalEquipment: 1, _id: 0 },
  ).sort({ slug: 1 }).lean() as unknown as CatalogRow[]
  const afterPrograms = await Program.find({}).lean() as unknown as ProgramLike[]
  const settled = isDumbbellCatalogSettled(planDumbbellCatalog(after))
    && planDumbbellProgramRepoints(afterPrograms).length === 0
    && planDumbbellDetailSpellOuts(afterPrograms).length === 0
  console.log(settled ? '\nDone — a second run would find nothing.' : '\n!! still not settled — re-run and read the plan.')

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
