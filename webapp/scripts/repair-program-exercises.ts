/**
 * Repair: every exercise a program names exists in the catalog.
 *
 * Card "Exercise do not exist in our data base": 36 distinct exercise
 * references across the nine live programs carried an `exerciseSlug` that no
 * Exercise document owned. Those entries render with no video, no
 * instructions and no row in the admin portal to fix either on — the four
 * screenshots on the card ("No demo video yet" under Rowing Sprints, Russian
 * Deadlift, Rest) are exactly that.
 *
 * lib/exerciseAutoCatalog.ts stops new ones appearing. This clears the ones
 * already in the database, in the order a coach would:
 *
 *   1. REPAIR TABLE (lib/programExerciseRepairs.ts) — the reviewed decision
 *      for each reference found on 2026-09-18. Relink where the exercise
 *      already exists under another name, create where it genuinely does not.
 *   2. NAME MATCH (lib/exerciseNameMatch.ts) — the app's own resolver, for
 *      anything added since the table was written.
 *   3. MINT — same row the app would mint on save, so nothing is left behind.
 *
 * A relink also registers the program's own wording as an alias on the target,
 * so the next program that says "DB Hammer Curl" resolves without any of this.
 * The program keeps its display name regardless: hydrateExercise treats the
 * program's `name` as an override over the catalog's.
 *
 * Members' own history is keyed by the same slug (UserProgress.workoutLogs
 * and exercisePRs), so a relink carries it across — otherwise this repair
 * would silently orphan somebody's personal record. A PR is one row per
 * (member, slug): where the member already holds one on the target slug the
 * two would have to be merged, so that case is REPORTED and left alone
 * rather than guessed at. Logged sets are a list, not a keyed row, so they
 * move unconditionally.
 *
 * Idempotent. A second run finds nothing to do.
 *
 * Run from webapp/:
 *   DRY RUN:  npx tsx scripts/repair-program-exercises.ts --prod
 *   APPLY:    npx tsx scripts/repair-program-exercises.ts --prod --apply
 *
 * Without --prod it uses MONGODB_URI (the dev database). With --prod the
 * connection string comes from the BECOME_RUNTIME_CONFIG payload in
 * redsecrets when REDSECRETS_MONGODB_URI + SECRETS_ENCRYPTION_KEY are set —
 * that is what the live app reads — falling back to PROD_MONGODB_URI, which
 * in a long-lived checkout goes stale.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import Exercise from '../models/Exercise'
import Program from '../models/Program'
import UserProgress from '../models/UserProgress'
import { buildExerciseNameIndex, matchExerciseName } from '../lib/exerciseNameMatch'
import { AUTO_CATALOG_TAG, buildAutoCatalogExercise, exerciseNameFromSlug } from '../lib/exerciseAutoCatalog'
import { repairFor } from '../lib/programExerciseRepairs'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')

type Decision =
  | { kind: 'relink'; to: string; source: string; note?: string }
  | { kind: 'create'; source: string; note?: string }

interface PlannedRef {
  slug: string
  label: string
  programs: string[]
  count: number
  decision: Decision
}

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

/** Every exercise entry in every program, with the program it came from. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkRefs(programs: Array<Record<string, any>>) {
  const refs: Array<{ slug: string; name: string; program: string }> = []
  for (const program of programs) {
    const programName = String(program.name ?? '(unnamed)')
    for (const phase of (program.phases ?? []) as Array<Record<string, any>>) {
      for (const workout of (phase.workouts ?? []) as Array<Record<string, any>>) {
        for (const ex of (workout.exercises ?? []) as Array<Record<string, any>>) {
          refs.push({
            slug: String(ex.exerciseSlug ?? ''),
            name: String(ex.name ?? ''),
            program: programName,
          })
        }
      }
    }
  }
  return refs
}

async function loadCatalog() {
  const exercises = await Exercise.find(
    {},
    { slug: 1, name: 1, aliases: 1, isCustom: 1, isUniversal: 1, _id: 0 },
  ).sort({ slug: 1 }).lean()
  return {
    slugs: new Set(exercises.map((e) => e.slug)),
    index: buildExerciseNameIndex(exercises),
  }
}

async function main() {
  const uri = await resolveUri()
  await mongoose.connect(uri)
  console.log(`connected to ${mongoose.connection.name} — ${APPLY ? 'APPLY' : 'DRY RUN'}\n`)

  const programs = await Program.find({}).lean() as unknown as Array<Record<string, any>>
  const { slugs, index } = await loadCatalog()
  console.log(`${programs.length} programs, ${slugs.size} catalog exercises`)

  // ── Plan ────────────────────────────────────────────────────────────────
  const planned = new Map<string, PlannedRef>()
  let total = 0
  for (const ref of walkRefs(programs)) {
    total++
    if (!ref.slug || slugs.has(ref.slug)) continue

    const existing = planned.get(ref.slug)
    if (existing) {
      existing.count++
      if (!existing.programs.includes(ref.program)) existing.programs.push(ref.program)
      continue
    }

    const repair = repairFor(ref.slug)
    // A reference with no `name` still names itself: the slug is the name
    // with the spaces taken out, so read it back rather than falling through
    // to a mint called "leg-curl-machine". This is the hole the "Leg curl
    // machine is not in our data base" card fell through — the first sweep
    // matched on `ref.name` only, so a nameless reference was never even
    // offered to the resolver.
    const slugLabel = exerciseNameFromSlug(ref.slug)
    const label = ref.name || repair?.label || slugLabel
    let decision: Decision
    if (repair?.relinkTo) {
      decision = { kind: 'relink', to: repair.relinkTo, source: 'repair table', note: repair.note }
    } else if (repair?.create) {
      decision = { kind: 'create', source: 'repair table', note: repair.note }
    } else {
      const matched = matchExerciseName(ref.name || slugLabel, index)
      decision = matched
        ? {
            kind: 'relink',
            to: matched.slug,
            source: `name match (${matched.via})${ref.name ? '' : ', read off the slug'}`,
          }
        : { kind: 'create', source: ref.name ? 'minted from the name' : 'minted from the slug' }
    }

    planned.set(ref.slug, { slug: ref.slug, label, programs: [ref.program], count: 1, decision })
  }

  console.log(`${total} exercise references, ${planned.size} of them pointing at nothing\n`)
  if (planned.size === 0) {
    console.log('Nothing to repair.')
    await mongoose.disconnect()
    return
  }

  const relinks = [...planned.values()].filter((p) => p.decision.kind === 'relink')
  const creates = [...planned.values()].filter((p) => p.decision.kind === 'create')

  console.log(`── RELINK to an exercise that already exists (${relinks.length}) ──`)
  for (const p of relinks) {
    const d = p.decision as Extract<Decision, { kind: 'relink' }>
    console.log(`  ${p.slug} → ${d.to}`)
    console.log(`      "${p.label}" ×${p.count} in ${p.programs.join(', ')} [${d.source}]`)
    if (d.note) console.log(`      note: ${d.note}`)
  }

  console.log(`\n── CREATE a catalog row (${creates.length}) ──`)
  for (const p of creates) {
    const d = p.decision as Extract<Decision, { kind: 'create' }>
    console.log(`  ${p.slug}  "${p.label}" ×${p.count} in ${p.programs.join(', ')} [${d.source}]`)
    if (d.note) console.log(`      note: ${d.note}`)
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.')
    await mongoose.disconnect()
    return
  }

  // ── Apply ───────────────────────────────────────────────────────────────
  console.log('\n── applying ──')

  for (const p of creates) {
    const repair = repairFor(p.slug)
    const doc = repair?.create
      ? {
          slug: p.slug,
          ...repair.create,
          tags: [AUTO_CATALOG_TAG],
          isActive: true,
          isCustom: false,
        }
      : buildAutoCatalogExercise(p.label, p.slug)
    await Exercise.create(doc)
    console.log(`  created ${p.slug} (${doc.name})`)
  }

  for (const p of relinks) {
    const d = p.decision as Extract<Decision, { kind: 'relink' }>
    const target = await Exercise.findOne({ slug: d.to }, { name: 1, aliases: 1 }).lean()
    if (!target) {
      console.error(`  !! ${d.to} does not exist — ${p.slug} left alone`)
      continue
    }
    const known = [target.name, ...(target.aliases ?? [])].map((n) => n.trim().toLowerCase())
    if (p.label && !known.includes(p.label.trim().toLowerCase())) {
      await Exercise.updateOne({ slug: d.to }, { $addToSet: { aliases: p.label.trim() } })
      console.log(`  ${d.to} += alias "${p.label.trim()}"`)
    }
  }

  // Carry members' logged sets and personal records across with the slug.
  let movedLogs = 0
  let movedPRs = 0
  const prConflicts: string[] = []
  const relinkBySlug = new Map(relinks.map((p) => [p.slug, (p.decision as Extract<Decision, { kind: 'relink' }>).to]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progresses = await UserProgress.find(
    {
      $or: [
        { 'workoutLogs.exercises.exerciseSlug': { $in: [...relinkBySlug.keys()] } },
        { 'exercisePRs.exerciseSlug': { $in: [...relinkBySlug.keys()] } },
      ],
    },
    { userId: 1, workoutLogs: 1, exercisePRs: 1 },
  ).lean() as unknown as Array<Record<string, any>>

  for (const progress of progresses) {
    let touched = false

    for (const log of (progress.workoutLogs ?? []) as Array<Record<string, any>>) {
      for (const ex of (log.exercises ?? []) as Array<Record<string, any>>) {
        const to = relinkBySlug.get(String(ex.exerciseSlug ?? ''))
        if (!to) continue
        ex.exerciseSlug = to
        movedLogs++
        touched = true
      }
    }

    const heldSlugs = new Set(((progress.exercisePRs ?? []) as Array<Record<string, any>>).map((pr) => String(pr.exerciseSlug)))
    for (const pr of (progress.exercisePRs ?? []) as Array<Record<string, any>>) {
      const to = relinkBySlug.get(String(pr.exerciseSlug ?? ''))
      if (!to) continue
      if (heldSlugs.has(to)) {
        prConflicts.push(`${String(progress.userId)}: ${String(pr.exerciseSlug)} → ${to} (already holds a PR there)`)
        continue
      }
      pr.exerciseSlug = to
      heldSlugs.add(to)
      movedPRs++
      touched = true
    }

    if (touched) {
      await UserProgress.updateOne(
        { _id: progress._id },
        { $set: { workoutLogs: progress.workoutLogs, exercisePRs: progress.exercisePRs } },
      )
    }
  }
  console.log(`  ${movedLogs} logged sets and ${movedPRs} personal records carried across`)
  for (const conflict of prConflicts) console.log(`  !! PR left alone — ${conflict}`)

  // Rewrite the program references themselves. The whole `phases` array is
  // written back per program: the entries are three levels deep and a
  // positional update cannot reach them.
  let rewritten = 0
  for (const program of programs) {
    let touched = false
    for (const phase of (program.phases ?? []) as Array<Record<string, any>>) {
      for (const workout of (phase.workouts ?? []) as Array<Record<string, any>>) {
        for (const ex of (workout.exercises ?? []) as Array<Record<string, any>>) {
          const plan = planned.get(String(ex.exerciseSlug ?? ''))
          if (!plan || plan.decision.kind !== 'relink') continue
          ex.exerciseSlug = plan.decision.to
          touched = true
          rewritten++
        }
      }
    }
    if (touched) {
      await Program.updateOne({ _id: program._id }, { $set: { phases: program.phases } })
      console.log(`  rewrote ${String(program.name)}`)
    }
  }
  console.log(`  ${rewritten} program references relinked`)

  // ── Verify ──────────────────────────────────────────────────────────────
  const after = await Program.find({}).lean() as unknown as Array<Record<string, any>>
  const fresh = await loadCatalog()
  const stillDangling = walkRefs(after)
    .filter((r) => r.slug && !fresh.slugs.has(r.slug))
  console.log(`\nafter: ${stillDangling.length} references still pointing at nothing`)
  if (stillDangling.length > 0) {
    for (const r of stillDangling) console.error(`  !! ${r.slug} in ${r.program}`)
    process.exitCode = 1
  }

  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
