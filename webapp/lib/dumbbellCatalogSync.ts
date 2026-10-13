// Making the live catalog say what lib/dumbbellCatalog.ts decided.
//
// THIS FILE IS THE ANSWER TO "You didn't change anything."
//
// The first round of this card wrote the reviewed table (lib/dumbbellCatalog.ts),
// the pure planner (lib/dumbbellCatalogPlan.ts), the repo's catalog snapshot
// (data/exercises.json, data/programs.json) and a migration script — and then
// nobody ran the script. The admin portal reads MongoDB, not the repo, so from
// the coach's side the pull request changed nothing at all: the exercises still
// read "DB" and still were not in the portal.
//
// A migration that needs a person to remember it is not a migration. So the
// reconciliation lives here, behind one function, and three things call it:
//
//   * app/api/cron/sync-exercise-catalog  — the writer in production.
//   * .github/workflows/sync-exercise-catalog.yml — calls that route on every
//     push to `main` (so merging IS applying) and daily afterwards.
//   * scripts/dumbbell-catalog.ts --prod  — the same run, by hand, for a dry
//     run against a database from a laptop.
//
// It is CONVERGENT, not a one-shot: it reads the live catalog, plans, writes
// only the difference, then re-plans and reports whether a second run would
// find anything. A run with nothing to do writes nothing at all, which is why
// it is safe on a schedule.
//
// WHAT IT DELIBERATELY DOES NOT DO: member history. A split's host row is a
// real exercise six other programs still prescribe, so moving somebody's
// `romanian-deadlift` PR onto `dumbbell-romanian-deadlift` would be wrong for
// everyone training under a barbell, and a logged set does not record which
// program it came from. Sets already logged stay where they are.

import Exercise from '@/models/Exercise'
import Program from '@/models/Program'
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
  type ProgramLike,
} from './dumbbellCatalogPlan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

/** The fields the plan reads. Projected rather than fetched whole so a sync
 *  never drags the entire catalog's instruction text across the wire. */
const CATALOG_PROJECTION = {
  slug: 1,
  name: 1,
  aliases: 1,
  variations: 1,
  optionalEquipment: 1,
  _id: 0,
} as const

export interface DumbbellSyncReport {
  ranAt: string
  /** False for a dry run: everything is computed, nothing is written. */
  apply: boolean
  exercises: number
  programs: number
  /** One line per outstanding catalog change, before anything was written. */
  plan: string[]
  /** Program references that still point at the row the dumbbell version was
   *  split out of. */
  repoints: string[]
  /** Program wording that still says "DB". */
  programText: string[]
  /** What was actually written (empty on a dry run). */
  wrote: {
    created: string[]
    hostEdits: string[]
    renames: string[]
    spellOuts: string[]
    programs: string[]
  }
  /** A slug the table names that the catalog does not hold. Never empty
   *  silently — that is a typo in the table or a row somebody deleted. */
  missingSlugs: string[]
  /** True when a second run would find nothing. The only honest "done". */
  settled: boolean
}

/**
 * Reconcile the live `exercises` and `programs` collections with the reviewed
 * table. Assumes a connection is already open (the route calls `connectDB`,
 * the script calls `mongoose.connect`).
 */
export async function syncDumbbellCatalog(options: { apply: boolean }): Promise<DumbbellSyncReport> {
  const { apply } = options
  const ranAt = new Date().toISOString()

  const catalog = (await Exercise.find({}, CATALOG_PROJECTION)
    .sort({ slug: 1 })
    .lean()) as unknown as CatalogRow[]
  const programs = (await Program.find({}).lean()) as unknown as AnyRow[]

  const plan = planDumbbellCatalog(catalog)
  const repoints = planDumbbellProgramRepoints(programs as ProgramLike[])
  const details = planDumbbellDetailSpellOuts(programs as ProgramLike[])
  const texts = planDumbbellProgramTextSpellOuts(programs as ProgramLike[])
  const labels = planDumbbellProtocolLabels(programs as ProgramLike[])

  const report: DumbbellSyncReport = {
    ranAt,
    apply,
    exercises: catalog.length,
    programs: programs.length,
    plan: describeDumbbellCatalogPlan(plan),
    repoints: repoints.map((r) => `${r.programName ?? r.programId}: ${r.from} → ${r.to}`),
    programText: [
      ...texts.map((t) => `${t.programId}.${t.field}: "${t.from}" → "${t.to}"`),
      ...details.map((d) => `${d.programId} protocol bullets: "${d.from}" → "${d.to}"`),
      ...labels.map((l) => `${l.programId} ${l.slug}: → "${l.to}"`),
    ],
    wrote: { created: [], hostEdits: [], renames: [], spellOuts: [], programs: [] },
    missingSlugs: plan.missingSlugs,
    settled: isDumbbellCatalogSettled(plan) && isDumbbellProgramsSettled(programs as ProgramLike[]),
  }

  if (!apply || report.settled) return report

  // ── Catalog ──
  for (const create of plan.creates) {
    try {
      await Exercise.create(buildDumbbellExerciseDoc(create.slug, create.create))
      report.wrote.created.push(create.slug)
    } catch (error) {
      // A concurrent run got there first; the unique index on `slug` settles it.
      if ((error as { code?: number })?.code !== 11000) throw error
    }
  }

  for (const edit of plan.hostEdits) {
    const pull: AnyRow = {}
    if (edit.removeAliases.length > 0) pull.aliases = { $in: edit.removeAliases }
    if (edit.removeOptionalEquipment.length > 0) pull.optionalEquipment = { $in: edit.removeOptionalEquipment }
    const update: AnyRow = {}
    if (Object.keys(pull).length > 0) update.$pull = pull
    if (edit.addVariations.length > 0) update.$addToSet = { variations: { $each: edit.addVariations } }
    if (Object.keys(update).length === 0) continue
    await Exercise.updateOne({ slug: edit.slug }, update)
    report.wrote.hostEdits.push(edit.slug)
  }

  for (const rename of plan.renames) {
    await Exercise.updateOne(
      { slug: rename.slug },
      {
        $set: { name: rename.to },
        ...(rename.addAliases.length ? { $addToSet: { aliases: { $each: rename.addAliases } } } : {}),
      },
    )
    report.wrote.renames.push(rename.slug)
  }

  for (const spell of plan.spellOuts) {
    const set: AnyRow = {}
    if (spell.name) set.name = spell.name.to
    if (spell.aliases) set.aliases = spell.aliases.to
    if (Object.keys(set).length === 0) continue
    await Exercise.updateOne({ slug: spell.slug }, { $set: set })
    report.wrote.spellOuts.push(spell.slug)
  }

  // ── Programs ──
  // The whole `phases` array is written back per program: the entries are three
  // levels deep and a positional update cannot reach them.
  const touched = new Map<string, AnyRow>()
  const entryOf = (programId: string, phaseIndex: number, workoutIndex: number, exerciseIndex: number) => {
    const program = programs.find((p) => String(p.program_id) === programId)
    const entry = program?.phases?.[phaseIndex]?.workouts?.[workoutIndex]?.exercises?.[exerciseIndex]
    return { program, entry }
  }

  for (const r of repoints) {
    const { program, entry } = entryOf(r.programId, r.phaseIndex, r.workoutIndex, r.exerciseIndex)
    if (!program || !entry || entry.exerciseSlug !== r.from) continue
    entry.exerciseSlug = r.to
    touched.set(r.programId, program)
  }
  for (const d of details) {
    const { program, entry } = entryOf(d.programId, d.phaseIndex, d.workoutIndex, d.exerciseIndex)
    if (!program || !entry || entry.details !== d.from) continue
    entry.details = d.to
    touched.set(d.programId, program)
  }
  for (const l of labels) {
    const { program, entry } = entryOf(l.programId, l.phaseIndex, l.workoutIndex, l.exerciseIndex)
    if (!program || !entry || entry.exerciseSlug !== l.slug) continue
    entry.name = l.to
    touched.set(l.programId, program)
  }

  for (const [programId, program] of touched) {
    await Program.updateOne({ _id: program._id }, { $set: { phases: program.phases } })
    report.wrote.programs.push(programId)
  }

  for (const t of texts) {
    await Program.updateOne({ program_id: t.programId }, { $set: { [t.field]: t.to } })
    if (!report.wrote.programs.includes(t.programId)) report.wrote.programs.push(t.programId)
  }

  // ── Re-plan against what is now stored: the run is only done if a second
  //    pass would find nothing. ──
  const after = (await Exercise.find({}, CATALOG_PROJECTION)
    .sort({ slug: 1 })
    .lean()) as unknown as CatalogRow[]
  const afterPrograms = (await Program.find({}).lean()) as unknown as ProgramLike[]
  const afterPlan = planDumbbellCatalog(after)
  report.settled = isDumbbellCatalogSettled(afterPlan) && isDumbbellProgramsSettled(afterPrograms)
  report.missingSlugs = afterPlan.missingSlugs

  return report
}
