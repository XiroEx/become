/**
 * Repair: the dumbbell-only program's exercises are their own catalog rows.
 *
 * Card "We need to have support for our dumbbell only program": nine exercise
 * references across the two dumbbell-only programs pointed at a barbell,
 * machine, cable or bodyweight row that merely had a similar name — "what they
 * do is get added under like a similar name. I honestly don't like that." The
 * reasoning, the evidence and the full table live in
 * lib/dumbbellProgramExercises.ts; this is the write.
 *
 * Four steps, in this order:
 *
 *   1. CREATE   DUMBBELL_VARIANT_EXERCISES — the nine "Dumbbell X" rows, with
 *               no video, so they land in the admin portal's "No Video" tab,
 *               which is the queue of exercises waiting for Jon to record one.
 *               Skipped, never overwritten, if the slug is already there.
 *   2. EDIT     Every catalog row: hand the coach's dumbbell wording over to
 *               the new row, cross-link the two as variations, add the wording
 *               Jon searches with, and spell every remaining "DB" out as
 *               "Dumbbell" ("I'd rather switch them all to just say dumbbell").
 *   3. REPOINT  Only the dumbbell-only programs. A barbell program's Romanian
 *               deadlift is still a barbell Romanian deadlift.
 *   4. VERIFY   No reference points at nothing, no dumbbell-only program still
 *               points at a folded row, no name or alias still says "DB".
 *
 * MEMBER HISTORY IS DELIBERATELY NOT MOVED. The sibling script
 * repair-program-exercises.ts carries workoutLogs and exercisePRs across when
 * it relinks, because there the old slug was dangling — nothing else could
 * possibly have been using it. Here the old slug is a real, still-programmed
 * exercise: `crunch` is the bodyweight crunch and `romanian-deadlift` is the
 * barbell RDL, and four other programs prescribe them. Rewriting a member's
 * logged sets from `crunch` to `dumbbell-crunch` would move the history of
 * everyone who ever did a bodyweight crunch. A member on the dumbbell program
 * starts a fresh log against the new slug, which is correct: the number they
 * were logging against a bodyweight crunch was not a dumbbell load.
 *
 * Idempotent. A second run finds nothing to do.
 *
 * Run from webapp/:
 *   DRY RUN:  npx tsx scripts/repair-dumbbell-program-exercises.ts --prod
 *   APPLY:    npx tsx scripts/repair-dumbbell-program-exercises.ts --prod --apply
 *
 * Without --prod it uses MONGODB_URI (the dev database). With --prod the
 * connection string comes from the BECOME_RUNTIME_CONFIG payload in
 * redsecrets when REDSECRETS_MONGODB_URI + SECRETS_ENCRYPTION_KEY are set —
 * that is what the live app reads — falling back to PROD_MONGODB_URI.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import Exercise from '../models/Exercise'
import Program from '../models/Program'
import {
  DUMBBELL_ALIAS_ADDITIONS,
  DUMBBELL_ONLY_PROGRAM_IDS,
  DUMBBELL_VARIANT_EXERCISES,
  DUMBBELL_VARIANT_SPLITS,
  computeDumbbellRowDiff,
  dumbbellRepointFor,
  dumbbellRowFixes,
  usesDumbbellShorthand,
} from '../lib/dumbbellProgramExercises'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')
const LABEL = `[${PROD ? 'PROD' : 'DEV'} ${APPLY ? 'APPLY' : 'DRY'}]`

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

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDoc = Record<string, any>

/** Every exercise entry in every program, with where it came from. */
function walkRefs(programs: AnyDoc[]) {
  const refs: Array<{ programId: string; programName: string; slug: string }> = []
  for (const program of programs) {
    const programId = String(program.program_id ?? '')
    const programName = String(program.name ?? '(unnamed)')
    for (const phase of (program.phases ?? []) as AnyDoc[]) {
      for (const workout of (phase.workouts ?? []) as AnyDoc[]) {
        for (const ex of (workout.exercises ?? []) as AnyDoc[]) {
          refs.push({ programId, programName, slug: String(ex.exerciseSlug ?? '') })
        }
      }
    }
  }
  return refs
}

async function main() {
  const uri = await resolveUri()
  await mongoose.connect(uri)
  console.log(`${LABEL} connected to ${mongoose.connection.name}\n`)

  // ── 1. Create the dumbbell rows ──────────────────────────────────────────
  console.log(`── CREATE (${DUMBBELL_VARIANT_EXERCISES.length} dumbbell variants) ──`)
  let created = 0
  let alreadyThere = 0
  for (const def of DUMBBELL_VARIANT_EXERCISES) {
    const existing = await Exercise.exists({ slug: def.slug })
    if (existing) {
      console.log(`  ✓ ${def.slug} (already exists)`)
      alreadyThere++
      continue
    }
    console.log(`  + ${def.slug} — "${def.name}" [${def.equipment.join(', ')}, ${def.trackingType}]`)
    if (APPLY) {
      await Exercise.create(def)
      created++
    }
  }

  // ── 2. Edit every catalog row ────────────────────────────────────────────
  const fixes = dumbbellRowFixes()
  console.log(
    `\n── EDIT (${fixes.size} curated rows, plus the DB→Dumbbell spelling pass over the whole catalog) ──`,
  )
  const rows = await Exercise.find({}, { slug: 1, name: 1, aliases: 1, variations: 1 })
    .sort({ slug: 1 })
    .lean<Array<{ _id: unknown; slug: string; name: string; aliases?: string[]; variations?: string[] }>>()
  console.log(`  ${rows.length} catalog rows`)

  let edited = 0
  for (const row of rows) {
    const fix = fixes.get(row.slug)
    const diff = computeDumbbellRowDiff(
      { name: row.name, aliases: row.aliases ?? [], variations: row.variations ?? [] },
      fix,
    )
    if (!diff.changed) continue
    edited++
    console.log(`  ✎ ${row.slug} — ${diff.reason}`)
    if (diff.nameChanged) console.log(`      name:       "${row.name}" → "${diff.name}"`)
    if (diff.aliasesChanged) console.log(`      aliases:    [${(row.aliases ?? []).join(' | ')}] → [${diff.aliases.join(' | ')}]`)
    if (diff.variationsChanged) console.log(`      variations: → [${diff.variations.join(', ')}]`)
    if (APPLY) {
      await Exercise.updateOne(
        { slug: row.slug },
        { $set: { name: diff.name, aliases: diff.aliases, variations: diff.variations } },
      )
    }
  }
  for (const fix of fixes.values()) {
    if (!rows.some((r) => r.slug === fix.slug)) console.error(`  !! ${fix.slug} is not in the catalog — fix skipped`)
  }

  // ── 3. Repoint the dumbbell-only programs ────────────────────────────────
  console.log(`\n── REPOINT (${DUMBBELL_ONLY_PROGRAM_IDS.join(', ')}) ──`)
  const programs = await Program.find({}).lean() as unknown as AnyDoc[]
  let repointed = 0
  for (const program of programs) {
    const programId = String(program.program_id ?? '')
    let touched = false
    for (const phase of (program.phases ?? []) as AnyDoc[]) {
      for (const workout of (phase.workouts ?? []) as AnyDoc[]) {
        for (const ex of (workout.exercises ?? []) as AnyDoc[]) {
          const to = dumbbellRepointFor(programId, String(ex.exerciseSlug ?? ''))
          if (!to) continue
          console.log(`  ${programId} / ${String(phase.phase)} / ${String(workout.day)}: ${String(ex.exerciseSlug)} → ${to}`)
          ex.exerciseSlug = to
          touched = true
          repointed++
        }
      }
    }
    // The whole `phases` array goes back per program: the entries are three
    // levels deep and a positional update cannot reach them.
    if (touched && APPLY) {
      await Program.updateOne({ _id: program._id }, { $set: { phases: program.phases } })
      console.log(`  rewrote ${String(program.name)}`)
    }
  }
  if (repointed === 0) console.log('  nothing to repoint')

  if (!APPLY) {
    console.log(
      `\n${LABEL} DRY RUN — nothing written. Would create ${DUMBBELL_VARIANT_EXERCISES.length - alreadyThere},`
      + ` edit ${edited}, repoint ${repointed}. Re-run with --apply.`,
    )
    await mongoose.disconnect()
    return
  }

  // ── 4. Verify ────────────────────────────────────────────────────────────
  console.log('\n── VERIFY ──')
  const after = await Program.find({}).lean() as unknown as AnyDoc[]
  const catalog = await Exercise.find({}, { slug: 1, name: 1, aliases: 1 })
    .lean<Array<{ slug: string; name: string; aliases?: string[] }>>()
  const slugs = new Set(catalog.map((e) => e.slug))
  let problems = 0

  for (const ref of walkRefs(after)) {
    // `__protocol__*` is a routing marker for an AMRAP/EMOM block, not an
    // exercise — hydrateExercise has always excluded it from this rule.
    if (!ref.slug || ref.slug.startsWith('__protocol__') || slugs.has(ref.slug)) continue
    console.error(`  !! ${ref.slug} in ${ref.programName} points at nothing`)
    problems++
  }
  for (const ref of walkRefs(after)) {
    const to = dumbbellRepointFor(ref.programId, ref.slug)
    if (!to) continue
    console.error(`  !! ${ref.programName} still points at ${ref.slug} (should be ${to})`)
    problems++
  }
  for (const row of catalog) {
    for (const text of [row.name, ...(row.aliases ?? [])]) {
      if (!usesDumbbellShorthand(text)) continue
      console.error(`  !! ${row.slug} still says DB: "${text}"`)
      problems++
    }
  }
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    if (!slugs.has(split.to)) {
      console.error(`  !! ${split.to} was never created`)
      problems++
    }
  }
  for (const addition of DUMBBELL_ALIAS_ADDITIONS) {
    const row = catalog.find((e) => e.slug === addition.slug)
    const known = new Set([row?.name ?? '', ...(row?.aliases ?? [])].map((n) => n.trim().toLowerCase()))
    for (const alias of addition.aliases) {
      if (known.has(alias.trim().toLowerCase())) continue
      console.error(`  !! ${addition.slug} is missing the alias "${alias}"`)
      problems++
    }
  }

  console.log(
    `\n${LABEL} created ${created}, edited ${edited}, repointed ${repointed} — ${problems} problem(s)`,
  )
  if (problems > 0) process.exitCode = 1

  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
