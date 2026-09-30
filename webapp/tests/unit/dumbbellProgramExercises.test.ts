// Run with: npm run test:file tests/unit/dumbbellProgramExercises.test.ts
//
// Card: "We need to have support for our dumbbell only program. When I
// searched the exercise in the admin portal, none of the exercises pop up.
// Instead, what they do is get added under like a similar name."
//
// The table in lib/dumbbellProgramExercises.ts drives a one-off write across
// the production catalog AND the two dumbbell-only programs, so the things
// that would make that write go wrong are checked here rather than discovered
// halfway through the run: a value the Exercise schema would reject, a repoint
// to a row nothing creates, a program that is not a dumbbell program being
// rewritten, an alias handed to two rows at once.
//
// The resolver block is the one that matters most. It rebuilds the catalog rows
// involved exactly as they are today, resolves the coach's own wording against
// them through lib/exerciseNameMatch.ts (the resolver the app uses on every
// program save), shows that "Dumbbell Crunch" lands on the BODYWEIGHT crunch
// before the change, and pins that it lands on Dumbbell Crunch after it —
// while every generic row still resolves to itself. That is Jon's comment
// ("one is with weight the other is without") as an executable assertion.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Exercise from '../../models/Exercise'
import {
  DUMBBELL_ALIAS_ADDITIONS,
  DUMBBELL_ONLY_PROGRAM_IDS,
  DUMBBELL_VARIANT_EXERCISES,
  DUMBBELL_VARIANT_SPLITS,
  computeDumbbellRowDiff,
  dumbbellRepointFor,
  dumbbellRowFixes,
  dumbbellVariantFor,
  spellDumbbellInFull,
  usesDumbbellShorthand,
} from '../../lib/dumbbellProgramExercises'
import { buildExerciseNameIndex, matchExerciseName } from '../../lib/exerciseNameMatch'
import { matchesAuditSearch } from '../../lib/exerciseAudit'
import { getBellWeightInfo } from '../../lib/workout/dumbbellWeight'

const ROOT = path.join(__dirname, '../..')
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

/** The enum a schema path accepts. Array paths keep it on the element def. */
function enumValues(pathName: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaPath = Exercise.schema.path(pathName) as any
  const values: string[] = schemaPath.enumValues?.length
    ? schemaPath.enumValues
    : schemaPath.options?.type?.[0]?.enum ?? []
  assert.ok(values.length > 0, `no enum found for ${pathName} — this check is not checking anything`)
  return values
}

// ─── The catalog, as it is in production today ─────────────────────────────
//
// Every row this card touches. The aliases are not invented: they are the
// coach's own program wording, recorded on these rows by the earlier relink
// sweep and still visible in webapp/scripts/seed_exercises.mjs and
// data/exercises.json (the last block below cross-checks them against it).

interface Row {
  slug: string
  name: string
  aliases: string[]
  variations: string[]
}

const BEFORE_ROWS: Record<string, Row> = {
  'crunch': { slug: 'crunch', name: 'Crunch', aliases: ['DB Crunch × 20'], variations: [] },
  'russian-twist': {
    slug: 'russian-twist',
    name: 'Russian Twist',
    aliases: ['Russian Twists', 'Russian Twists × 40', 'Russian Twists (with DB) × 40', 'Dumbbell Russian Twist'],
    variations: [],
  },
  'cable-woodchopper': {
    slug: 'cable-woodchopper',
    name: 'Cable Woodchopper',
    aliases: ['DB Woodchoppers × 15 per side'],
    variations: [],
  },
  'romanian-deadlift': {
    slug: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    aliases: ['RDL', 'RDL (Barbell or Dumbbell)', 'Dumbbell RDL', 'DB Romanian Deadlift', 'Dumbbell Romanian Deadlift'],
    variations: ['stiff-leg-deadlift', 'single-leg-rdl'],
  },
  'hip-thrust': {
    slug: 'hip-thrust',
    name: 'Hip Thrust',
    aliases: ['Barbell Hip Thrust', 'DB Hip Thrust', 'Dumbbell Hip Thrust'],
    variations: ['glute-bridge'],
  },
  'skull-crusher': {
    slug: 'skull-crusher',
    name: 'Skull Crusher',
    aliases: ['Skull Crushers', 'DB Skull Crushers'],
    variations: ['cable-tricep-pushdown', 'overhead-tricep-extension'],
  },
  'step-up': {
    slug: 'step-up',
    name: 'Step-Up',
    aliases: ['Step Ups', 'DB Step-Ups', 'Box Step-Ups'],
    variations: [],
  },
  'standing-calf-raise': {
    slug: 'standing-calf-raise',
    name: 'Standing Calf Raise',
    aliases: ['Standing Calf Raise (with DBs)', 'Standing or Seated Calf Raise', 'DB Calf Raises'],
    variations: ['seated-calf-raise'],
  },
  'push-press': {
    slug: 'push-press',
    name: 'Push Press',
    aliases: ['Push-Press', 'Dumbbell Push Press'],
    variations: ['overhead-press'],
  },
  'overhead-tricep-extension': {
    slug: 'overhead-tricep-extension',
    name: 'Overhead Tricep Extension',
    aliases: ['Overhead Triceps Extension', 'DB Overhead Tricep Extension', 'Dumbbell Triceps Overhead Extension'],
    variations: ['cable-tricep-pushdown'],
  },
  // Two rows nothing splits, present so the checks can prove they are left
  // alone apart from the DB→Dumbbell spelling.
  'dumbbell-curl': {
    slug: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    aliases: ['DB Curls', 'Dumbbell Bicep Curl', 'Dumbbell Biceps Curl', 'DB Biceps Burnout'],
    variations: ['hammer-curl', 'barbell-curl'],
  },
  'seated-calf-raise': {
    slug: 'seated-calf-raise',
    name: 'Seated Calf Raise',
    aliases: ['Seated Calf Raise Machine'],
    variations: ['standing-calf-raise'],
  },
}

/** The catalog after the migration: every row put through the edit, plus the
 *  new dumbbell rows. Sorted by slug, the order the script reads them in. */
function afterCatalog(): Row[] {
  const fixes = dumbbellRowFixes()
  const edited: Row[] = Object.values(BEFORE_ROWS).map((row) => {
    const diff = computeDumbbellRowDiff(row, fixes.get(row.slug))
    return { slug: row.slug, name: diff.name, aliases: diff.aliases, variations: diff.variations }
  })
  const created: Row[] = DUMBBELL_VARIANT_EXERCISES.map((e) => ({
    slug: e.slug,
    name: e.name,
    aliases: e.aliases,
    variations: e.variations,
  }))
  return [...edited, ...created].sort((a, b) => a.slug.localeCompare(b.slug))
}

// ─── The new rows ──────────────────────────────────────────────────────────

test('every created row carries values the Exercise schema accepts', () => {
  const categories = enumValues('category')
  const mechanics = enumValues('mechanics')
  const roles = enumValues('role')
  const patterns = enumValues('movementPatterns')
  const lateralities = enumValues('laterality')
  const difficulties = enumValues('difficulty')
  const tracking = enumValues('trackingType')
  const regions = enumValues('bodyRegion')
  const muscles = enumValues('primaryMuscles')
  const equipment = enumValues('equipment')

  for (const ex of DUMBBELL_VARIANT_EXERCISES) {
    assert.ok(categories.includes(ex.category), `${ex.slug}: category ${ex.category}`)
    assert.ok(mechanics.includes(ex.mechanics), `${ex.slug}: mechanics ${ex.mechanics}`)
    assert.ok(roles.includes(ex.role), `${ex.slug}: role ${ex.role}`)
    assert.ok(lateralities.includes(ex.laterality), `${ex.slug}: laterality ${ex.laterality}`)
    assert.ok(difficulties.includes(ex.difficulty), `${ex.slug}: difficulty ${ex.difficulty}`)
    assert.ok(tracking.includes(ex.trackingType), `${ex.slug}: trackingType ${ex.trackingType}`)
    assert.ok(regions.includes(ex.bodyRegion), `${ex.slug}: bodyRegion ${ex.bodyRegion}`)
    assert.ok(ex.movementPatterns.length > 0, `${ex.slug}: no movement pattern`)
    for (const p of ex.movementPatterns) assert.ok(patterns.includes(p), `${ex.slug}: pattern ${p}`)
    for (const m of [...ex.primaryMuscles, ...ex.secondaryMuscles, ...ex.stabilizers]) {
      assert.ok(muscles.includes(m), `${ex.slug}: muscle ${m}`)
    }
    for (const e of [...ex.equipment, ...ex.optionalEquipment]) {
      assert.ok(equipment.includes(e), `${ex.slug}: equipment ${e}`)
    }
    assert.ok(ex.primaryMuscles.length > 0, `${ex.slug}: no primary muscle — the Broken audit tab would flag it`)
  }
})

test('every created row is a dumbbell exercise, spelled in full, with its own slug', () => {
  const seen = new Set<string>()
  for (const ex of DUMBBELL_VARIANT_EXERCISES) {
    assert.match(ex.slug, SLUG, `${ex.slug} is not slug-shaped`)
    assert.equal(seen.has(ex.slug), false, `${ex.slug} appears twice`)
    seen.add(ex.slug)
    assert.ok(ex.slug.startsWith('dumbbell-'), `${ex.slug} should be a dumbbell- slug`)
    assert.ok(ex.name.startsWith('Dumbbell '), `${ex.slug}: name "${ex.name}" must say Dumbbell`)
    assert.ok(
      ex.equipment.includes('dumbbell'),
      `${ex.slug}: equipment must include dumbbell — lib/workout/dumbbellWeight.ts reads equipment, not the name`,
    )
    for (const text of [ex.name, ...ex.aliases]) {
      assert.equal(usesDumbbellShorthand(text), false, `${ex.slug} still says DB: "${text}"`)
    }
  }
})

test('a created row is worth creating — description and coaching text', () => {
  for (const ex of DUMBBELL_VARIANT_EXERCISES) {
    assert.ok(ex.description.trim().length > 40, `${ex.slug} has no real description`)
    assert.ok(ex.instructions.length >= 3, `${ex.slug} has ${ex.instructions.length} instructions`)
    assert.ok(ex.cues.length >= 2, `${ex.slug} has ${ex.cues.length} cues`)
    assert.ok(ex.commonMistakes.length >= 1, `${ex.slug} has no common mistakes`)
    for (const line of [...ex.instructions, ...ex.cues, ...ex.commonMistakes]) {
      assert.ok(line.trim(), `${ex.slug} has an empty coaching line`)
    }
  }
})

test('no created row ships with a video — the No Video tab is the upload queue', () => {
  for (const ex of DUMBBELL_VARIANT_EXERCISES) {
    assert.equal('videoUrl' in ex, false, `${ex.slug} must not guess a video onto itself`)
  }
})

test('the weight input on every created row is a per-dumbbell one', () => {
  for (const ex of DUMBBELL_VARIANT_EXERCISES) {
    assert.equal(getBellWeightInfo(ex).style, 'dumbbell', `${ex.slug} would show barbell plate math`)
  }
})

// ─── The splits ────────────────────────────────────────────────────────────

test('every split points at a row this table creates, and never at itself', () => {
  const created = new Set(DUMBBELL_VARIANT_EXERCISES.map((e) => e.slug))
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    assert.match(split.from, SLUG, `${split.from} is not slug-shaped`)
    assert.match(split.to, SLUG, `${split.to} is not slug-shaped`)
    assert.notEqual(split.from, split.to, `${split.from} splits into itself`)
    assert.ok(created.has(split.to), `${split.from} → ${split.to}, which nothing creates`)
    assert.ok(split.reason.trim().length > 40, `${split.from} has no reasoning written down`)
    assert.ok(split.fromName.trim(), `${split.from} has no fromName`)
  }
})

test('every created row is used by exactly one split', () => {
  const targets = DUMBBELL_VARIANT_SPLITS.map((s) => s.to)
  assert.equal(new Set(targets).size, targets.length, 'two splits share a target')
  assert.deepEqual(
    [...targets].sort(),
    DUMBBELL_VARIANT_EXERCISES.map((e) => e.slug).sort(),
    'a created row nothing repoints to is a row nobody will ever see',
  )
})

test('no split is declared twice, and no alias is handed to two rows', () => {
  const froms = new Set<string>()
  const handedOver = new Set<string>()
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    assert.equal(froms.has(split.from), false, `${split.from} is split twice`)
    froms.add(split.from)
    assert.ok(split.handOverAliases.length > 0, `${split.from} hands over no alias — nothing caused the fold`)
    for (const alias of split.handOverAliases) {
      const key = alias.trim().toLowerCase()
      assert.equal(handedOver.has(key), false, `"${alias}" is handed over twice`)
      handedOver.add(key)
    }
  }
})

test('every handed-over alias is carried by the row it is handed to', () => {
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    const variant = dumbbellVariantFor(split.to)
    assert.ok(variant, `${split.to} is not in DUMBBELL_VARIANT_EXERCISES`)
    const known = new Set(
      [variant!.name, ...variant!.aliases].map((n) => spellDumbbellInFull(n).trim().toLowerCase()),
    )
    for (const alias of split.handOverAliases) {
      assert.ok(
        known.has(spellDumbbellInFull(alias).trim().toLowerCase()),
        `${split.to} does not answer to "${alias}" — taking it off ${split.from} would lose the wording entirely`,
      )
    }
  }
})

test('every created row is cross-linked back to the generic row it split from', () => {
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    const variant = dumbbellVariantFor(split.to)!
    assert.ok(
      variant.variations.includes(split.from),
      `${split.to} should list ${split.from} as a variation so the swap modal offers one for the other`,
    )
  }
})

test('only the dumbbell-only programs are repointed', () => {
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    assert.ok(split.programs.length > 0, `${split.from} repoints nothing`)
    for (const programId of split.programs) {
      assert.ok(
        (DUMBBELL_ONLY_PROGRAM_IDS as readonly string[]).includes(programId),
        `${split.from} would rewrite ${programId}, which is not a dumbbell-only program`,
      )
    }
  }
})

test('dumbbellRepointFor is keyed by program AND slug, so the barbell programs keep theirs', () => {
  assert.equal(dumbbellRepointFor('db-only-total-transformation', 'crunch'), 'dumbbell-crunch')
  assert.equal(dumbbellRepointFor('program_5', 'romanian-deadlift'), 'dumbbell-romanian-deadlift')
  // The four barbell/gym programs that also prescribe these.
  assert.equal(dumbbellRepointFor('program_1_become', 'romanian-deadlift'), undefined)
  assert.equal(dumbbellRepointFor('strength-size-20', 'standing-calf-raise'), undefined)
  assert.equal(dumbbellRepointFor('program_2_30day_shred', 'push-press'), undefined)
  assert.equal(dumbbellRepointFor('circuit-superset-shred', 'skull-crusher'), undefined)
  // push-press is only in the 30-minute dumbbell program, not the 4-week one.
  assert.equal(dumbbellRepointFor('db-only-total-transformation', 'push-press'), undefined)
  assert.equal(dumbbellRepointFor('program_5', 'not-a-real-slug'), undefined)
})

test('each dumbbell program is repointed on exactly the exercises it programs', () => {
  // The 30-minute program has no woodchopper, crunch, step-up or skull
  // crusher day; the 4-week one has no barbell push press. Getting this wrong
  // would silently change a workout nobody asked about.
  const byProgram = new Map<string, string[]>()
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    for (const programId of split.programs) {
      byProgram.set(programId, [...(byProgram.get(programId) ?? []), split.from])
    }
  }
  assert.deepEqual(byProgram.get('db-only-total-transformation')!.sort(), [
    'cable-woodchopper',
    'crunch',
    'hip-thrust',
    'romanian-deadlift',
    'russian-twist',
    'skull-crusher',
    'standing-calf-raise',
    'step-up',
  ])
  assert.deepEqual(byProgram.get('program_5')!.sort(), [
    'hip-thrust',
    'push-press',
    'romanian-deadlift',
    'russian-twist',
    'standing-calf-raise',
  ])
})

test('the weighted core work is tracked with a weight — "one is with weight the other is without"', () => {
  // trackingType is the only field that decides whether a member gets a weight
  // box to log into, and the generic rows are both `reps_bodyweight`.
  assert.equal(dumbbellVariantFor('dumbbell-crunch')!.trackingType, 'reps_weight')
  assert.equal(dumbbellVariantFor('dumbbell-russian-twist')!.trackingType, 'reps_weight')
})

// ─── "DB" → "Dumbbell" ─────────────────────────────────────────────────────

test('spellDumbbellInFull rewrites the standalone token and nothing else', () => {
  assert.equal(spellDumbbellInFull('DB Curls'), 'Dumbbell Curls')
  assert.equal(spellDumbbellInFull('DB Crunch × 20'), 'Dumbbell Crunch × 20')
  assert.equal(spellDumbbellInFull('Incline DB Press'), 'Incline Dumbbell Press')
  assert.equal(spellDumbbellInFull('Light DB RDL → Upright Row × 15'), 'Light Dumbbell RDL → Upright Row × 15')
  assert.equal(spellDumbbellInFull('Standing Calf Raise (with DBs)'), 'Standing Calf Raise (with Dumbbells)')
  assert.equal(spellDumbbellInFull('Bench Press (DB/bar)'), 'Bench Press (Dumbbell/bar)')
  assert.equal(spellDumbbellInFull('db crunch'), 'Dumbbell crunch')
})

test('spellDumbbellInFull leaves a word that merely starts with those letters alone', () => {
  assert.equal(spellDumbbellInFull('DBell Row'), 'DBell Row')
  assert.equal(spellDumbbellInFull('Dumbbell Curl'), 'Dumbbell Curl')
  assert.equal(spellDumbbellInFull('Deadbug'), 'Deadbug')
})

test('spellDumbbellInFull is idempotent', () => {
  for (const text of ['DB Curls', 'Standing Calf Raise (with DBs)', 'Bench Press (DB/bar)', 'Cable Row']) {
    assert.equal(spellDumbbellInFull(spellDumbbellInFull(text)), spellDumbbellInFull(text))
  }
})

test('usesDumbbellShorthand answers the same way every call (no sticky-regex state)', () => {
  assert.equal(usesDumbbellShorthand('DB Curls'), true)
  assert.equal(usesDumbbellShorthand('DB Curls'), true)
  assert.equal(usesDumbbellShorthand('Dumbbell Curls'), false)
  assert.equal(usesDumbbellShorthand('Dumbbell Curls'), false)
})

// ─── The per-row edit ──────────────────────────────────────────────────────

test('dumbbellRowFixes covers every split source plus every alias addition', () => {
  const fixes = dumbbellRowFixes()
  for (const split of DUMBBELL_VARIANT_SPLITS) {
    const fix = fixes.get(split.from)
    assert.ok(fix, `no fix for ${split.from}`)
    assert.deepEqual(fix!.removeAliases, split.handOverAliases)
    assert.deepEqual(fix!.addVariations, [split.to])
  }
  for (const addition of DUMBBELL_ALIAS_ADDITIONS) {
    assert.deepEqual(fixes.get(addition.slug)?.addAliases, addition.aliases)
  }
})

test('the edit hands the alias over, cross-links the new row, and leaves the name alone', () => {
  const fixes = dumbbellRowFixes()
  const diff = computeDumbbellRowDiff(BEFORE_ROWS['crunch'], fixes.get('crunch'))
  assert.equal(diff.changed, true)
  assert.equal(diff.name, 'Crunch')
  assert.deepEqual(diff.aliases, [], 'the dumbbell wording belongs to dumbbell-crunch now')
  assert.deepEqual(diff.variations, ['dumbbell-crunch'])
})

test('the edit drops both spellings when one would become a duplicate of the other', () => {
  const fixes = dumbbellRowFixes()
  const diff = computeDumbbellRowDiff(BEFORE_ROWS['hip-thrust'], fixes.get('hip-thrust'))
  assert.deepEqual(diff.aliases, ['Barbell Hip Thrust'])
  assert.deepEqual(diff.variations, ['glute-bridge', 'dumbbell-hip-thrust'])
})

test('the edit adds the wording Jon searches with without renaming the row', () => {
  const fixes = dumbbellRowFixes()
  const diff = computeDumbbellRowDiff(
    BEFORE_ROWS['overhead-tricep-extension'],
    fixes.get('overhead-tricep-extension'),
  )
  assert.equal(
    diff.name,
    'Overhead Tricep Extension',
    'four programs display this name and three of them are not dumbbell programs',
  )
  assert.deepEqual(diff.aliases, [
    'Overhead Triceps Extension',
    'Dumbbell Overhead Tricep Extension',
    'Dumbbell Triceps Overhead Extension',
    'Dumbbell Overhead Tricep Press',
    'Dumbbell Overhead Triceps Press',
  ])
})

test('the spelling pass runs on rows with no curated fix at all', () => {
  const diff = computeDumbbellRowDiff(BEFORE_ROWS['dumbbell-curl'])
  assert.equal(diff.changed, true)
  assert.deepEqual(diff.aliases, [
    'Dumbbell Curls',
    'Dumbbell Bicep Curl',
    'Dumbbell Biceps Curl',
    'Dumbbell Biceps Burnout',
  ])
  assert.equal(diff.slug, '', 'a row with no fix carries no fix slug')
})

test('a row with nothing to change reports no change', () => {
  const diff = computeDumbbellRowDiff(BEFORE_ROWS['seated-calf-raise'])
  assert.equal(diff.changed, false)
})

test('the only aliases the dedupe drops are case-insensitive duplicates', () => {
  // The spelling pass creates collisions ("DB Bench Press" spelled out IS the
  // name), so the list has to be deduped. Nothing else may be lost: an alias
  // that differs by more than case has to survive, punctuation included.
  const diff = computeDumbbellRowDiff({
    name: 'Dumbbell Bench Press',
    aliases: ['DB Bench Press', 'Bench Press (Dumbbell)', 'bench press (dumbbell)', 'Dumbbell Bench-Press'],
    variations: [],
  })
  assert.deepEqual(diff.aliases, ['Bench Press (Dumbbell)', 'Dumbbell Bench-Press'])
})

test('the edit is idempotent — a second run reports no change', () => {
  const fixes = dumbbellRowFixes()
  for (const [slug, before] of Object.entries(BEFORE_ROWS)) {
    const first = computeDumbbellRowDiff(before, fixes.get(slug))
    const second = computeDumbbellRowDiff(
      { name: first.name, aliases: first.aliases, variations: first.variations },
      fixes.get(slug),
    )
    assert.equal(second.changed, false, `${slug} is not idempotent`)
  }
})

test('the edit never removes an existing variation link', () => {
  const fixes = dumbbellRowFixes()
  const diff = computeDumbbellRowDiff(BEFORE_ROWS['romanian-deadlift'], fixes.get('romanian-deadlift'))
  assert.ok(diff.variations.includes('stiff-leg-deadlift'))
  assert.ok(diff.variations.includes('single-leg-rdl'))
  assert.ok(diff.variations.includes('dumbbell-romanian-deadlift'))
})

// ─── The resolver stops folding the two together ───────────────────────────

test('BEFORE: the resolver folds the dumbbell exercise into its lookalike', () => {
  const index = buildExerciseNameIndex(Object.values(BEFORE_ROWS))
  // This is the bug in five lines: the program says "DB Crunch × 20", and the
  // only row that answers is the BODYWEIGHT crunch.
  assert.equal(matchExerciseName('DB Crunch', index)?.slug, 'crunch')
  assert.equal(matchExerciseName('Dumbbell Crunch', index)?.slug, 'crunch')
  assert.equal(matchExerciseName('DB Hip Thrust', index)?.slug, 'hip-thrust')
  assert.equal(matchExerciseName('DB Romanian Deadlift', index)?.slug, 'romanian-deadlift')
  assert.equal(matchExerciseName('DB Woodchoppers', index)?.slug, 'cable-woodchopper')
})

test("AFTER: the coach's dumbbell wording resolves to the dumbbell row", () => {
  const index = buildExerciseNameIndex(afterCatalog())
  const expected: Array<[string, string]> = [
    ['Dumbbell Crunch', 'dumbbell-crunch'],
    ['DB Crunch', 'dumbbell-crunch'],
    ['DB Crunch × 20', 'dumbbell-crunch'],
    ['Dumbbell Russian Twist', 'dumbbell-russian-twist'],
    ['Russian Twists (with DB) × 40', 'dumbbell-russian-twist'],
    ['DB Woodchoppers × 15 per side', 'dumbbell-woodchopper'],
    ['Dumbbell Romanian Deadlift', 'dumbbell-romanian-deadlift'],
    ['DB Romanian Deadlift', 'dumbbell-romanian-deadlift'],
    ['Dumbbell RDL', 'dumbbell-romanian-deadlift'],
    ['Dumbbell Hip Thrust', 'dumbbell-hip-thrust'],
    ['DB Hip Thrust', 'dumbbell-hip-thrust'],
    ['DB Skull Crushers', 'dumbbell-skull-crusher'],
    ['DB Step-Ups', 'dumbbell-step-up'],
    ['DB Calf Raises', 'dumbbell-calf-raise'],
    ['Dumbbell Push Press', 'dumbbell-push-press'],
  ]
  for (const [wording, slug] of expected) {
    assert.equal(matchExerciseName(wording, index)?.slug, slug, `"${wording}" should resolve to ${slug}`)
  }
})

test('AFTER: every generic row still resolves to itself — nothing was stolen', () => {
  const index = buildExerciseNameIndex(afterCatalog())
  for (const row of Object.values(BEFORE_ROWS)) {
    assert.equal(
      matchExerciseName(row.name, index)?.slug,
      row.slug,
      `"${row.name}" no longer resolves to ${row.slug}`,
    )
  }
  // And the wording that was never about a dumbbell keeps working.
  assert.equal(matchExerciseName('RDL', index)?.slug, 'romanian-deadlift')
  assert.equal(matchExerciseName('Barbell Hip Thrust', index)?.slug, 'hip-thrust')
  assert.equal(matchExerciseName('Box Step-Ups', index)?.slug, 'step-up')
  assert.equal(matchExerciseName('Standing or Seated Calf Raise', index)?.slug, 'standing-calf-raise')
})

test('AFTER: the admin portal search finds every one of them, by the words Jon uses', () => {
  const catalog = afterCatalog()
  const searches: Array<[string, string]> = [
    ['dumbbell overhead tricep press', 'overhead-tricep-extension'],
    ['dumbbell crunch', 'dumbbell-crunch'],
    ['DB crunch', 'dumbbell-crunch'],
    ['dumbbell hip thrust', 'dumbbell-hip-thrust'],
    ['dumbbell romanian deadlift', 'dumbbell-romanian-deadlift'],
    ['dumbbell skull crusher', 'dumbbell-skull-crusher'],
    ['dumbbell step-up', 'dumbbell-step-up'],
    ['dumbbell calf raise', 'dumbbell-calf-raise'],
    ['dumbbell push press', 'dumbbell-push-press'],
    ['dumbbell russian twist', 'dumbbell-russian-twist'],
    ['dumbbell woodchopper', 'dumbbell-woodchopper'],
  ]
  for (const [query, slug] of searches) {
    const hits = catalog.filter((row) => matchesAuditSearch(row, query)).map((row) => row.slug)
    assert.ok(
      hits.includes(slug),
      `searching "${query}" in the admin portal must find ${slug}, got [${hits.join(', ')}]`,
    )
  }
})

test('AFTER: no name or alias anywhere still says DB', () => {
  for (const row of afterCatalog()) {
    for (const text of [row.name, ...row.aliases]) {
      assert.equal(usesDumbbellShorthand(text), false, `${row.slug} still says DB: "${text}"`)
    }
  }
})

// ─── The write itself ──────────────────────────────────────────────────────

test('the repair script drives everything off the table and touches nothing else', () => {
  const src = readSource('scripts/repair-dumbbell-program-exercises.ts')
  assert.match(src, /DUMBBELL_VARIANT_EXERCISES/)
  assert.match(src, /computeDumbbellRowDiff/)
  assert.match(src, /dumbbellRepointFor/)
  assert.match(src, /--apply/, 'it must default to a dry run')
  assert.doesNotMatch(
    src,
    /UserProgress/,
    "the old slug is a live exercise four other programs use — rewriting logged sets would move everyone's bodyweight-crunch history",
  )
})

test('the repair script verifies its own work before it exits', () => {
  const src = readSource('scripts/repair-dumbbell-program-exercises.ts')
  assert.match(src, /usesDumbbellShorthand/, 'the DB→Dumbbell pass has to be checked, not assumed')
  assert.match(src, /points at nothing/, 'no reference may be left dangling')
  assert.match(src, /process\.exitCode = 1/)
})

test('the repoint plan matches the programs in the committed snapshot', () => {
  // data/programs.json is the committed programs snapshot. This is the check
  // that the table describes the programs as they are rather than as they were
  // remembered: every (program, slug) pair it claims to repoint has to be a
  // reference that actually exists, and after the repoint every reference in a
  // dumbbell-only program has to name a row that exists in the catalog.
  const programsPath = path.join(ROOT, '..', 'data', 'programs.json')
  const exercisesPath = path.join(ROOT, '..', 'data', 'exercises.json')
  if (!fs.existsSync(programsPath) || !fs.existsSync(exercisesPath)) return

  const programs = JSON.parse(fs.readFileSync(programsPath, 'utf8')) as Array<{
    program_id: string
    phases?: Array<{ workouts?: Array<{ exercises?: Array<{ exerciseSlug?: string }> }> }>
  }>
  const catalogSlugs = new Set(
    (JSON.parse(fs.readFileSync(exercisesPath, 'utf8')) as Array<{ slug: string }>).map((e) => e.slug),
  )
  for (const ex of DUMBBELL_VARIANT_EXERCISES) catalogSlugs.add(ex.slug)

  const refs = new Set<string>()
  for (const program of programs) {
    for (const phase of program.phases ?? []) {
      for (const workout of phase.workouts ?? []) {
        for (const ex of workout.exercises ?? []) {
          if (ex.exerciseSlug) refs.add(`${program.program_id}::${ex.exerciseSlug}`)
        }
      }
    }
  }

  const migrated = DUMBBELL_VARIANT_SPLITS.some((s) => s.programs.some((p) => refs.has(`${p}::${s.to}`)))

  for (const programId of DUMBBELL_ONLY_PROGRAM_IDS) {
    assert.ok(
      programs.some((p) => p.program_id === programId),
      `${programId} is not in the programs snapshot — the table names a program that does not exist`,
    )
  }

  for (const split of DUMBBELL_VARIANT_SPLITS) {
    for (const programId of split.programs) {
      const before = refs.has(`${programId}::${split.from}`)
      const after = refs.has(`${programId}::${split.to}`)
      assert.ok(
        migrated ? after : before,
        migrated
          ? `${programId} should already point at ${split.to}`
          : `${programId} does not reference ${split.from} — there is nothing there to repoint`,
      )
    }
    // A slug the table does NOT list for a program must not be silently moved.
    for (const programId of programs.map((p) => p.program_id)) {
      if (split.programs.includes(programId)) continue
      assert.equal(
        dumbbellRepointFor(programId, split.from),
        undefined,
        `${programId} would be rewritten without being listed`,
      )
    }
  }

  // Every reference in a dumbbell-only program resolves after the repoint.
  // `__protocol__*` is a routing marker for an AMRAP/EMOM block, not an
  // exercise — hydrateExercise has always excluded it from this rule.
  for (const program of programs) {
    if (!(DUMBBELL_ONLY_PROGRAM_IDS as readonly string[]).includes(program.program_id)) continue
    for (const phase of program.phases ?? []) {
      for (const workout of phase.workouts ?? []) {
        for (const ex of workout.exercises ?? []) {
          const slug = ex.exerciseSlug
          if (!slug || slug.startsWith('__protocol__')) continue
          const next = dumbbellRepointFor(program.program_id, slug) ?? slug
          assert.ok(catalogSlugs.has(next), `${program.program_id} would point at ${next}, which does not exist`)
        }
      }
    }
  }
})

test('the fixture and the split table agree with the committed catalog snapshot', () => {
  // data/exercises.json is the committed catalog snapshot, and it is where the
  // BEFORE fixture above was copied from — if the two drift, every resolver
  // check above is asserting against a catalog that no longer exists.
  //
  // The snapshot can legitimately be in either state, so which one it is
  // decides what gets checked: once someone refreshes it after the migration
  // has run, the dumbbell rows are in it and the handed-over aliases are not,
  // and the fixture becomes history rather than a live description. Both
  // states are valid; a snapshot that is in NEITHER is the bug.
  const snapshotPath = path.join(ROOT, '..', 'data', 'exercises.json')
  if (!fs.existsSync(snapshotPath)) return
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Array<{
    slug: string
    name: string
    aliases?: string[]
  }>
  const bySlug = new Map(snapshot.map((e) => [e.slug, e]))
  const migrated = DUMBBELL_VARIANT_SPLITS.some((s) => bySlug.has(s.to))

  if (migrated) {
    for (const split of DUMBBELL_VARIANT_SPLITS) {
      assert.ok(bySlug.has(split.to), `${split.to} is missing from a migrated snapshot`)
      const aliases = new Set((bySlug.get(split.from)?.aliases ?? []).map((a) => a.trim().toLowerCase()))
      for (const alias of split.handOverAliases) {
        assert.equal(
          aliases.has(spellDumbbellInFull(alias).trim().toLowerCase()),
          false,
          `${split.from} still carries "${alias}" after the split`,
        )
      }
    }
    return
  }

  for (const split of DUMBBELL_VARIANT_SPLITS) {
    const row = bySlug.get(split.from)
    assert.ok(row, `${split.from} is not in the catalog snapshot`)
    assert.equal(row!.name, split.fromName, `${split.from}: fromName is out of date`)
    const aliases = new Set((row!.aliases ?? []).map((a) => a.trim().toLowerCase()))
    for (const alias of split.handOverAliases) {
      assert.ok(aliases.has(alias.trim().toLowerCase()), `${split.from} does not carry the alias "${alias}"`)
    }
  }

  for (const row of Object.values(BEFORE_ROWS)) {
    const real = bySlug.get(row.slug)
    assert.ok(real, `${row.slug} is not in the catalog snapshot`)
    assert.equal(real!.name, row.name, `${row.slug}: the fixture name is out of date`)
    assert.deepEqual(
      real!.aliases ?? [],
      row.aliases,
      `${row.slug}: the fixture aliases are out of date, so the resolver checks above prove nothing`,
    )
  }
})
