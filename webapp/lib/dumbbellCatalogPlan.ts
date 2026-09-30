// Turning lib/dumbbellCatalog.ts into a list of writes — and answering
// "is there anything left to do?".
//
// The table is the decision; this is the diff. It is pure and takes the
// catalog as an argument so the SAME code plans the production migration
// (scripts/dumbbell-catalog.ts) and checks the repo's own catalog fixture
// (tests/unit/dumbbellCatalog.test.ts). A plan that is empty means the
// catalog already says what the card asked for, which is the only definition
// of "done" that cannot drift from the code that does the work.
//
// Everything here is idempotent by construction: a create is skipped when the
// slug exists, an alias removal is skipped when the alias is gone, a rename is
// skipped when the name is already the new one, and the "DB" → "Dumbbell" pass
// is a fixed point (spelling out twice is the same as spelling out once).

import {
  DUMBBELL_ADDITIONS,
  DUMBBELL_ONLY_PROGRAM_IDS,
  DUMBBELL_RENAMES,
  DUMBBELL_SPLITS,
  spellOutDumbbell,
  type DumbbellExerciseCreate,
} from './dumbbellCatalog'

export interface CatalogRow {
  slug: string
  name: string
  aliases?: string[]
  variations?: string[]
  optionalEquipment?: string[]
}

/** A row to create. `from` is the host it was split out of, if any. */
export interface PlannedCreate {
  slug: string
  from?: string
  create: DumbbellExerciseCreate
  note: string
}

/**
 * The host row of a split: it loses the alias that named the dumbbell version,
 * loses `dumbbell` from its optional equipment (the dumbbell way of doing it
 * is a row now, not a footnote on this one), and gains the new slug as a
 * variation so the pair are siblings in the swap/variation picker.
 */
export interface PlannedHostEdit {
  slug: string
  removeAliases: string[]
  removeOptionalEquipment: string[]
  addVariations: string[]
}

export interface PlannedRename {
  slug: string
  from: string
  to: string
  addAliases: string[]
}

/** "DB" spelled out, plus the alias hygiene that follows from it. */
export interface PlannedSpellOut {
  slug: string
  name?: { from: string; to: string }
  aliases?: { from: string[]; to: string[] }
}

export interface DumbbellCatalogPlan {
  creates: PlannedCreate[]
  hostEdits: PlannedHostEdit[]
  renames: PlannedRename[]
  spellOuts: PlannedSpellOut[]
  /** A slug the table names that the catalog does not hold — a typo, or a row
   *  somebody deleted. Reported rather than silently skipped. */
  missingSlugs: string[]
}

/** Case-insensitive comparison key, with "DB" spelled out so an alias matches
 *  whether or not the spell-out pass has already run over it. */
function aliasKey(text: string): string {
  return spellOutDumbbell(text).trim().toLowerCase()
}

/**
 * The alias list a row should hold: every alias spelled out, blanks dropped,
 * duplicates collapsed (case-insensitively), and anything that merely repeats
 * the row's own name removed. Order is preserved — first occurrence wins.
 */
export function normalizeAliases(name: string, aliases: readonly string[] = []): string[] {
  const seen = new Set<string>([spellOutDumbbell(name).trim().toLowerCase()])
  const out: string[] = []
  for (const raw of aliases) {
    if (typeof raw !== 'string') continue
    const next = spellOutDumbbell(raw).trim()
    if (!next) continue
    const key = next.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(next)
  }
  return out
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * Everything left to do to `catalog`. Pass the whole catalog; rows the table
 * says nothing about are still checked for the "DB" → "Dumbbell" pass, which
 * is catalog-wide by request ("I'd rather switch them all to just say
 * dumbbell").
 */
export function planDumbbellCatalog(catalog: readonly CatalogRow[]): DumbbellCatalogPlan {
  const bySlug = new Map(catalog.map((row) => [row.slug, row]))
  const plan: DumbbellCatalogPlan = {
    creates: [],
    hostEdits: [],
    renames: [],
    spellOuts: [],
    missingSlugs: [],
  }

  // ── Splits: the new row, and the host it came off ──
  for (const split of DUMBBELL_SPLITS) {
    const host = bySlug.get(split.from)
    if (!host) plan.missingSlugs.push(split.from)

    if (!bySlug.has(split.slug)) {
      // The moved aliases move: the coach's own wording for the dumbbell
      // version belongs on the row that owns it, so "Russian Twists (with DB)
      // × 40" still finds something — the dumbbell one, not the bodyweight
      // one. Anything that merely repeats the new name is dropped.
      plan.creates.push({
        slug: split.slug,
        from: split.from,
        create: {
          ...split.create,
          aliases: normalizeAliases(split.create.name, [...split.create.aliases, ...split.movedAliases]),
        },
        note: split.note,
      })
    }

    if (!host) continue

    const moved = new Set(split.movedAliases.map(aliasKey))
    const removeAliases = (host.aliases ?? []).filter((alias) => moved.has(aliasKey(alias)))
    const removeOptionalEquipment = (host.optionalEquipment ?? []).includes('dumbbell') ? ['dumbbell'] : []
    const addVariations = (host.variations ?? []).includes(split.slug) ? [] : [split.slug]
    if (removeAliases.length > 0 || removeOptionalEquipment.length > 0 || addVariations.length > 0) {
      plan.hostEdits.push({ slug: host.slug, removeAliases, removeOptionalEquipment, addVariations })
    }
  }

  // ── Additions: movements with no row anywhere ──
  for (const addition of DUMBBELL_ADDITIONS) {
    if (!bySlug.has(addition.slug)) {
      plan.creates.push({
        slug: addition.slug,
        create: {
          ...addition.create,
          aliases: normalizeAliases(addition.create.name, addition.create.aliases),
        },
        note: addition.note,
      })
    }
  }

  // ── Renames: a name that does not say which implement it is ──
  for (const rename of DUMBBELL_RENAMES) {
    const row = bySlug.get(rename.slug)
    if (!row) {
      plan.missingSlugs.push(rename.slug)
      continue
    }
    const have = new Set((row.aliases ?? []).map(aliasKey))
    const addAliases = rename.addAliases.filter((alias) => !have.has(aliasKey(alias)))
    if (row.name !== rename.to || addAliases.length > 0) {
      plan.renames.push({ slug: rename.slug, from: row.name, to: rename.to, addAliases })
    }
  }

  // ── "DB" → "Dumbbell", catalog-wide ──
  // Run last, and over the state the steps above will have left behind, so a
  // moved alias is not reported twice and a rename's new name is the one
  // checked.
  const removedByHost = new Map<string, Set<string>>()
  for (const edit of plan.hostEdits) {
    removedByHost.set(edit.slug, new Set(edit.removeAliases.map(aliasKey)))
  }
  const renamedTo = new Map(plan.renames.map((r) => [r.slug, r]))

  for (const row of catalog) {
    const rename = renamedTo.get(row.slug)
    const removed = removedByHost.get(row.slug)
    const aliases = [
      ...(row.aliases ?? []).filter((alias) => !removed?.has(aliasKey(alias))),
      ...(rename?.addAliases ?? []),
    ]

    const nextName = spellOutDumbbell(rename ? rename.to : row.name)
    const nextAliases = normalizeAliases(nextName, aliases)

    const entry: PlannedSpellOut = { slug: row.slug }
    if (!rename && nextName !== row.name) entry.name = { from: row.name, to: nextName }
    if (!sameList(nextAliases, aliases)) entry.aliases = { from: aliases, to: nextAliases }
    if (entry.name || entry.aliases) plan.spellOuts.push(entry)
  }

  return plan
}

/** Nothing left to do. */
export function isDumbbellCatalogSettled(plan: DumbbellCatalogPlan): boolean {
  return (
    plan.creates.length === 0
    && plan.hostEdits.length === 0
    && plan.renames.length === 0
    && plan.spellOuts.length === 0
    && plan.missingSlugs.length === 0
  )
}

/** A one-line-per-change summary, for the migration's log. */
export function describeDumbbellCatalogPlan(plan: DumbbellCatalogPlan): string[] {
  const lines: string[] = []
  for (const c of plan.creates) {
    lines.push(`create  ${c.slug}  "${c.create.name}"${c.from ? `  (split from ${c.from})` : ''}`)
  }
  for (const h of plan.hostEdits) {
    const bits: string[] = []
    if (h.removeAliases.length) bits.push(`-alias ${h.removeAliases.map((a) => `"${a}"`).join(', ')}`)
    if (h.removeOptionalEquipment.length) bits.push(`-optionalEquipment ${h.removeOptionalEquipment.join(', ')}`)
    if (h.addVariations.length) bits.push(`+variation ${h.addVariations.join(', ')}`)
    lines.push(`host    ${h.slug}  ${bits.join('  ')}`)
  }
  for (const r of plan.renames) {
    const extra = r.addAliases.length ? `  +alias ${r.addAliases.map((a) => `"${a}"`).join(', ')}` : ''
    lines.push(`rename  ${r.slug}  "${r.from}" → "${r.to}"${extra}`)
  }
  for (const s of plan.spellOuts) {
    const bits: string[] = []
    if (s.name) bits.push(`name "${s.name.from}" → "${s.name.to}"`)
    if (s.aliases) bits.push(`aliases [${s.aliases.from.join(' | ')}] → [${s.aliases.to.join(' | ')}]`)
    lines.push(`spell   ${s.slug}  ${bits.join('  ')}`)
  }
  for (const slug of plan.missingSlugs) {
    lines.push(`MISSING ${slug}  — named by the table, not in the catalog`)
  }
  return lines
}

// ─── Programs ───────────────────────────────────────────────────────────────

export interface ProgramExerciseRef {
  exerciseSlug?: string
  /** A protocol block's bullet list, stored as free text. */
  details?: string
  [key: string]: unknown
}

export interface ProgramLike {
  program_id?: string
  name?: string
  phases?: Array<{ workouts?: Array<{ exercises?: ProgramExerciseRef[] }> }>
}

export interface PlannedRepoint {
  programId: string
  programName?: string
  phaseIndex: number
  workoutIndex: number
  exerciseIndex: number
  from: string
  to: string
}

/**
 * The dumbbell-only programs' references that still point at the barbell /
 * machine / bodyweight row the dumbbell version was split out of.
 *
 * Only the programs a split names explicitly are touched: Step-Up stays a
 * Step-Up in the BECOME program, and the Russian Twist in the At-Home program
 * stays the bodyweight one. Nothing outside DUMBBELL_ONLY_PROGRAM_IDS is ever
 * considered, which the unit test pins.
 */
export function planDumbbellProgramRepoints(programs: readonly ProgramLike[]): PlannedRepoint[] {
  const targets = new Map<string, Map<string, string>>(); // programId → from → to
  for (const split of DUMBBELL_SPLITS) {
    for (const programId of split.repoint) {
      const forProgram = targets.get(programId) ?? new Map<string, string>()
      forProgram.set(split.from, split.slug)
      targets.set(programId, forProgram)
    }
  }

  const out: PlannedRepoint[] = []
  for (const program of programs) {
    const programId = program.program_id
    if (!programId) continue
    const moves = targets.get(programId)
    if (!moves) continue

    const phases = program.phases ?? []
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      const workouts = phases[phaseIndex]?.workouts ?? []
      for (let workoutIndex = 0; workoutIndex < workouts.length; workoutIndex += 1) {
        const exercises = workouts[workoutIndex]?.exercises ?? []
        for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
          const from = exercises[exerciseIndex]?.exerciseSlug
          if (!from) continue
          const to = moves.get(from)
          if (!to) continue
          out.push({
            programId,
            programName: program.name,
            phaseIndex,
            workoutIndex,
            exerciseIndex,
            from,
            to,
          })
        }
      }
    }
  }
  return out
}

/** A protocol block's free-text bullet list, with "DB" spelled out. */
export interface PlannedDetailsSpellOut {
  programId: string
  programName?: string
  phaseIndex: number
  workoutIndex: number
  exerciseIndex: number
  from: string
  to: string
}

/**
 * The program text a member actually reads. A protocol entry's `details` is a
 * free-text bullet list — "Minute 1: 12 DB Push Press" — and it is rendered on
 * the workout card, so leaving it in shorthand while the catalog spells
 * everything out is the same request half-answered.
 *
 * Every program, not just the dumbbell-only ones: "I'd rather switch them all
 * to just say dumbbell."
 */
export function planDumbbellDetailSpellOuts(programs: readonly ProgramLike[]): PlannedDetailsSpellOut[] {
  const out: PlannedDetailsSpellOut[] = []
  for (const program of programs) {
    const programId = program.program_id
    if (!programId) continue
    const phases = program.phases ?? []
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      const workouts = phases[phaseIndex]?.workouts ?? []
      for (let workoutIndex = 0; workoutIndex < workouts.length; workoutIndex += 1) {
        const exercises = workouts[workoutIndex]?.exercises ?? []
        for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
          const from = exercises[exerciseIndex]?.details
          if (typeof from !== 'string' || !from) continue
          const to = spellOutDumbbell(from)
          if (to === from) continue
          out.push({
            programId,
            programName: program.name,
            phaseIndex,
            workoutIndex,
            exerciseIndex,
            from,
            to,
          })
        }
      }
    }
  }
  return out
}

/** Every program id a split repoints — for asserting the table stays inside
 *  the two dumbbell-only programs. */
export function repointedProgramIds(): string[] {
  const ids = new Set<string>()
  for (const split of DUMBBELL_SPLITS) {
    for (const id of split.repoint) ids.add(id)
  }
  return [...ids].sort()
}

export { DUMBBELL_ONLY_PROGRAM_IDS }
