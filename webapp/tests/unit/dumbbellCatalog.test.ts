// Run with: npm run test:file tests/unit/dumbbellCatalog.test.ts
//
// Card: "We need to have support for our dumbbell only program. When I
// searched the exercise in the admin portal, none of the exercises pop up.
// Instead, what they do is get added under like a similar name. I honestly
// don't like that. We use DB for those exercises and I'd rather switch them
// all to just say dumbbell. But the main thing is that dumbbell overhead
// tricep press and all of the exercises needs to appear on admin portal."
//
// Comments: "Go through the whole program and make sure all of the exercises
// exist in the admin portal." / "We need crunch and dumbbell crunch to be
// separate because they are two different exercises. One is with weight the
// other is without." / "Please make sure all exercises are accounted for. If
// the exercise already exists let it be. I need to be able to upload videos
// to every exercise."
//
// Three things are pinned here, in the order a reader cares about them:
//
//   1. THE OUTCOME — walk the two dumbbell-only programs as the repo holds
//      them and check every exercise they name has its own catalog row, that
//      row is a dumbbell (or bodyweight) exercise, an admin can find it by
//      searching for what the coach calls it, and it has no video yet so it
//      sits in the portal's upload queue.
//
//   2. THE TABLE — lib/dumbbellCatalog.ts drives a one-off write across
//      production exercises AND programs, so the things that would make that
//      write go wrong are checked here rather than discovered halfway through
//      the run: a value the Exercise schema would reject, a repoint that
//      escapes the two dumbbell-only programs, an alias left on the host that
//      would make the new name resolve to nothing.
//
//   3. THE PLAN IS SETTLED — planDumbbellCatalog against the repo's own
//      catalog comes back empty. That is the same function the migration
//      runs, so "the fixture is up to date" cannot drift from "the migration
//      has nothing left to do".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import Exercise from '../../models/Exercise'
import {
  DUMBBELL_ADDITIONS,
  DUMBBELL_ONLY_PROGRAM_IDS,
  DUMBBELL_RENAMES,
  DUMBBELL_SPLITS,
  spellOutDumbbell,
  usesDumbbellShorthand,
  type DumbbellExerciseCreate,
} from '../../lib/dumbbellCatalog'
import {
  isDumbbellCatalogSettled,
  normalizeAliases,
  planDumbbellCatalog,
  planDumbbellDetailSpellOuts,
  planDumbbellProgramRepoints,
  repointedProgramIds,
  type CatalogRow,
  type ProgramLike,
} from '../../lib/dumbbellCatalogPlan'
import { buildExerciseNameIndex, resolveExerciseSlug } from '../../lib/exerciseNameMatch'
import { isBrokenExercise, matchesAuditSearch } from '../../lib/exerciseAudit'

const ROOT = path.join(__dirname, '../..')
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

interface FixtureExercise extends CatalogRow {
  equipment?: string[]
  trackingType?: string
  videoUrl?: string | null
  instructions?: string[]
  primaryMuscles?: string[]
  tags?: string[]
}

const CATALOG = JSON.parse(
  fs.readFileSync(path.join(ROOT, '..', 'data', 'exercises.json'), 'utf8'),
) as FixtureExercise[]

const PROGRAMS = JSON.parse(
  fs.readFileSync(path.join(ROOT, '..', 'data', 'programs.json'), 'utf8'),
) as Array<ProgramLike & { name?: string }>

const BY_SLUG = new Map(CATALOG.map((e) => [e.slug, e]))
const NAME_INDEX = buildExerciseNameIndex([...CATALOG].sort((a, b) => a.slug.localeCompare(b.slug)))

/** Support gear: a bench, a box or a mat is not something you LOAD, so it does
 *  not stop a program being dumbbell-only. Same distinction
 *  lib/workout/equipmentVariant.ts draws. */
const SUPPORT_EQUIPMENT = new Set(['flat_bench', 'incline_bench', 'decline_bench', 'box', 'chair', 'exercise_mat', 'none'])

/** Every exercise slug the dumbbell-only programs name, protocol markers
 *  excluded — those are routing markers with no catalog row by design. */
function dumbbellProgramSlugs(): Array<{ programName: string; slug: string }> {
  const out: Array<{ programName: string; slug: string }> = []
  for (const program of PROGRAMS) {
    if (!DUMBBELL_ONLY_PROGRAM_IDS.includes(program.program_id ?? '')) continue
    for (const phase of program.phases ?? []) {
      for (const workout of phase.workouts ?? []) {
        for (const exercise of workout.exercises ?? []) {
          const slug = exercise.exerciseSlug
          if (!slug || slug.startsWith('__protocol__')) continue
          out.push({ programName: program.name ?? String(program.program_id), slug })
        }
      }
    }
  }
  return out
}

const TABLE_ENTRIES: Array<{ slug: string; create: DumbbellExerciseCreate }> = [
  ...DUMBBELL_SPLITS.map((s) => ({ slug: s.slug, create: s.create })),
  ...DUMBBELL_ADDITIONS.map((a) => ({ slug: a.slug, create: a.create })),
]

/** The enum a schema path accepts. Array paths keep it on the element
 *  definition rather than on the path itself. */
function enumValues(pathName: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaPath = Exercise.schema.path(pathName) as any
  const values: string[] = schemaPath.enumValues?.length
    ? schemaPath.enumValues
    : schemaPath.options?.type?.[0]?.enum ?? []
  assert.ok(values.length > 0, `no enum found for ${pathName} — this check is not checking anything`)
  return values
}

// ─── 1. The outcome, against the programs as the repo holds them ────────────

test('every exercise the dumbbell-only programs name has its own catalog row', () => {
  const missing: string[] = []
  for (const { programName, slug } of dumbbellProgramSlugs()) {
    if (!BY_SLUG.has(slug)) missing.push(`${programName}: ${slug}`)
  }
  assert.deepEqual(missing, [], 'these program exercises have no row in the admin portal')
})

test('a dumbbell-only program prescribes nothing but dumbbells and bodyweight', () => {
  // The card's title. Before this, the DB-only program sent a member to a
  // calf-raise machine, a cable stack, an EZ bar and a barbell.
  const offenders: string[] = []
  for (const { programName, slug } of dumbbellProgramSlugs()) {
    const row = BY_SLUG.get(slug)
    if (!row) continue
    const loaded = (row.equipment ?? []).filter((e) => !SUPPORT_EQUIPMENT.has(e))
    const ok = loaded.length === 0 || loaded.every((e) => e === 'dumbbell' || e === 'bodyweight')
    if (!ok) offenders.push(`${programName}: ${row.name} (${loaded.join(', ')})`)
  }
  assert.deepEqual(offenders, [], 'a dumbbell-only program cannot prescribe these')
})

test('an admin can find each of them by searching for its own name', () => {
  // The reported symptom: "When I searched the exercise in the admin portal,
  // none of the exercises pop up."
  const unfindable: string[] = []
  for (const { slug } of dumbbellProgramSlugs()) {
    const row = BY_SLUG.get(slug)
    if (!row) continue
    if (!matchesAuditSearch(row, row.name)) unfindable.push(row.name)
  }
  assert.deepEqual(unfindable, [])
})

test('"dumbbell overhead tricep press" finds the exercise the card names', () => {
  // "The main thing is that dumbbell overhead tricep press ... needs to appear
  // on admin portal." It is Overhead Tricep Extension, renamed to say which
  // implement it is, with the coach's wording as an alias.
  const row = BY_SLUG.get('overhead-tricep-extension')
  assert.ok(row, 'overhead-tricep-extension is in the catalog')
  assert.equal(row!.name, 'Dumbbell Overhead Tricep Extension')
  assert.equal(matchesAuditSearch(row!, 'dumbbell overhead tricep press'), true)
  assert.equal(matchesAuditSearch(row!, 'Dumbbell Overhead Tricep Press'), true)
  // ...and the name it used to have still finds it, so nothing that resolved
  // by the old wording stops resolving.
  assert.equal(matchesAuditSearch(row!, 'Overhead Tricep Extension'), true)
  assert.equal(resolveExerciseSlug('Overhead Tricep Extension', NAME_INDEX), 'overhead-tricep-extension')
  assert.equal(resolveExerciseSlug('Dumbbell Overhead Tricep Press', NAME_INDEX), 'overhead-tricep-extension')
})

test('crunch and dumbbell crunch are two exercises — one with weight, one without', () => {
  const crunch = BY_SLUG.get('crunch')
  const dumbbell = BY_SLUG.get('dumbbell-crunch')
  assert.ok(crunch && dumbbell, 'both rows exist')

  assert.deepEqual(crunch!.equipment, ['bodyweight'])
  assert.equal(crunch!.trackingType, 'reps_bodyweight', 'the unweighted one logs no weight')
  assert.deepEqual(dumbbell!.equipment, ['dumbbell'])
  assert.equal(dumbbell!.trackingType, 'reps_weight', 'the weighted one does')

  // Neither answers to the other's name, in either direction.
  assert.equal(resolveExerciseSlug('Crunch', NAME_INDEX), 'crunch')
  assert.equal(resolveExerciseSlug('Dumbbell Crunch', NAME_INDEX), 'dumbbell-crunch')
  assert.equal(resolveExerciseSlug('DB Crunch', NAME_INDEX), 'dumbbell-crunch')
  // The dumbbell is no longer a footnote on the bodyweight row.
  assert.equal((crunch!.optionalEquipment ?? []).includes('dumbbell'), false)
  assert.equal(matchesAuditSearch(crunch!, 'dumbbell crunch'), false, 'searching for the weighted one must not return the bodyweight one')
})

test('each split resolves to its own row, and the host still resolves to itself', () => {
  for (const split of DUMBBELL_SPLITS) {
    const host = BY_SLUG.get(split.from)
    const created = BY_SLUG.get(split.slug)
    assert.ok(host, `${split.from} is in the catalog`)
    assert.ok(created, `${split.slug} is in the catalog`)

    assert.equal(
      resolveExerciseSlug(created!.name, NAME_INDEX),
      split.slug,
      `"${created!.name}" does not resolve to ${split.slug} — an alias naming it is probably still on ${split.from}`,
    )
    assert.equal(
      resolveExerciseSlug(host!.name, NAME_INDEX),
      split.from,
      `"${host!.name}" stopped resolving to ${split.from}`,
    )
    // The wording the program came in with resolves to the new row too.
    for (const alias of split.movedAliases) {
      assert.equal(
        resolveExerciseSlug(spellOutDumbbell(alias), NAME_INDEX),
        split.slug,
        `"${alias}" does not resolve to ${split.slug}`,
      )
    }
  }
})

test('every new row is ready for a video and is not an empty shell', () => {
  // "I need to be able to upload videos to every exercise." No video is the
  // point for a new row — that is what lists it in the portal's "No Video"
  // tab. What would be wrong is a row with nothing else on it either.
  for (const { slug, create } of TABLE_ENTRIES) {
    const row = BY_SLUG.get(slug)
    assert.ok(row, `${slug} is in the catalog`)
    assert.equal(
      row!.videoUrl ?? null,
      create.video?.videoUrl ?? null,
      `${slug}'s video does not match what the table says it inherits`,
    )
    assert.equal(isBrokenExercise(row!), false, `${slug} is an empty shell`)
    assert.ok((row!.instructions ?? []).length >= 3, `${slug} has no instructions`)
    assert.ok((row!.primaryMuscles ?? []).length > 0, `${slug} has no primary muscle`)
  }
})

test('the two demos already recorded for a dumbbell version follow it onto its own row', () => {
  // Splitting a row must not make an EXISTING recording harder to reach. The
  // dumbbell hip thrust and the dumbbell RDL were both filmed; both were
  // reachable only through the barbell row's "DB …" alias, which this card
  // removes.
  const inherited = TABLE_ENTRIES.filter((e) => e.create.video)
  assert.deepEqual(
    inherited.map((e) => e.slug).sort(),
    ['dumbbell-hip-thrust', 'dumbbell-romanian-deadlift'],
    'the set of rows inheriting a recorded demo changed — is the new one really the same movement?',
  )
  for (const { slug, create } of inherited) {
    const video = create.video!
    assert.ok(video.source.trim().length > 20, `${slug}'s video provenance is not written down`)
    // The file is in the repo, so "it has a video" is checkable and not a claim.
    const file = path.join(ROOT, 'public', video.videoUrl.replace(/^\//, ''))
    assert.ok(fs.existsSync(file), `${slug} points at ${video.videoUrl}, which is not in public/`)
    assert.equal(BY_SLUG.get(slug)?.videoUrl, video.videoUrl)
  }
})

test('every other new row has no video, so it sits in the upload queue', () => {
  const waiting = TABLE_ENTRIES.filter((e) => !e.create.video).map((e) => e.slug)
  assert.equal(waiting.length, 10, 'ten of the twelve new rows are waiting for a recording')
  for (const slug of waiting) {
    assert.ok(!BY_SLUG.get(slug)?.videoUrl, `${slug} should have no video yet`)
  }
})

test('the movements the program only names inside a protocol block have rows too', () => {
  // "Please make sure all exercises are accounted for." The DB-only program's
  // EMOM / AMRAP / complex blocks name these in free text, so nothing ever
  // minted a row for them.
  for (const slug of ['dumbbell-swing', 'dumbbell-hang-clean', 'jumping-lunge']) {
    const row = BY_SLUG.get(slug)
    assert.ok(row, `${slug} is in the catalog`)
    assert.equal(matchesAuditSearch(row!, row!.name), true)
  }
  assert.equal(resolveExerciseSlug('DB Swings', NAME_INDEX), 'dumbbell-swing')
  assert.equal(resolveExerciseSlug('Dumbbell Hang Cleans', NAME_INDEX), 'dumbbell-hang-clean')
  assert.equal(resolveExerciseSlug('Jumping Lunges', NAME_INDEX), 'jumping-lunge')
  // ...and the kettlebell swing is still its own exercise.
  assert.equal(resolveExerciseSlug('Kettlebell Swing', NAME_INDEX), 'kettlebell-swing')
})

test('nothing in the catalog still says "DB"', () => {
  // "We use DB for those exercises and I'd rather switch them all to just say
  // dumbbell."
  const shorthand: string[] = []
  for (const row of CATALOG) {
    for (const text of [row.name, ...(row.aliases ?? [])]) {
      if (usesDumbbellShorthand(text)) shorthand.push(`${row.slug}: "${text}"`)
    }
  }
  assert.deepEqual(shorthand, [])
})

test('an admin searching in shorthand still finds the spelled-out row', () => {
  // Dropping "DB Curls" as an alias would have made the portal's literal
  // substring search useless to a coach who writes programs in shorthand, so
  // the search expands the shorthand instead.
  const curl = BY_SLUG.get('dumbbell-curl')
  assert.ok(curl)
  assert.equal(matchesAuditSearch(curl!, 'DB Curl'), true)
  assert.equal(matchesAuditSearch(curl!, 'db curls'), true)
  assert.equal(matchesAuditSearch(curl!, 'Dumbbell Curl'), true)
  // And it is still a search, not a match-anything.
  assert.equal(matchesAuditSearch(curl!, 'DB Bench Press'), false)
})

// ─── 2. The table ───────────────────────────────────────────────────────────

test('every slug in the table is slug-shaped and appears once', () => {
  const seen = new Set<string>()
  for (const { slug } of TABLE_ENTRIES) {
    assert.match(slug, SLUG, `${slug} is not slug-shaped`)
    assert.equal(seen.has(slug), false, `${slug} appears twice`)
    seen.add(slug)
  }
  for (const split of DUMBBELL_SPLITS) {
    assert.match(split.from, SLUG, `${split.from} is not slug-shaped`)
    assert.notEqual(split.from, split.slug, `${split.slug} splits from itself`)
  }
  for (const rename of DUMBBELL_RENAMES) {
    assert.match(rename.slug, SLUG)
    assert.notEqual(rename.from, rename.to, `${rename.slug} renames to the same name`)
  }
})

test('every classification value is one the Exercise schema accepts', () => {
  const single: Array<[string, keyof DumbbellExerciseCreate]> = [
    ['category', 'category'],
    ['mechanics', 'mechanics'],
    ['role', 'role'],
    ['laterality', 'laterality'],
    ['difficulty', 'difficulty'],
    ['trackingType', 'trackingType'],
    ['bodyRegion', 'bodyRegion'],
  ]
  const lists: Array<[string, keyof DumbbellExerciseCreate]> = [
    ['movementPatterns', 'movementPatterns'],
    ['primaryMuscles', 'primaryMuscles'],
    ['secondaryMuscles', 'secondaryMuscles'],
    ['stabilizers', 'stabilizers'],
    ['equipment', 'equipment'],
  ]

  for (const { slug, create } of TABLE_ENTRIES) {
    for (const [pathName, field] of single) {
      const allowed = enumValues(pathName)
      assert.ok(allowed.includes(String(create[field])), `${slug}.${pathName} = ${String(create[field])}`)
    }
    for (const [pathName, field] of lists) {
      const allowed = enumValues(pathName)
      for (const value of (create[field] ?? []) as string[]) {
        assert.ok(allowed.includes(value), `${slug}.${pathName} contains ${value}`)
      }
    }
  }
})

test('every new row is written as coaching content, not a shell', () => {
  for (const { slug, create } of TABLE_ENTRIES) {
    assert.ok(create.name.trim(), `${slug} has no name`)
    assert.ok(create.description.trim().length > 40, `${slug} has no real description`)
    assert.ok(create.instructions.length >= 3, `${slug} has fewer than 3 instructions`)
    assert.ok(create.cues.length >= 2, `${slug} has fewer than 2 cues`)
    assert.ok(create.commonMistakes.length >= 2, `${slug} has fewer than 2 common mistakes`)
    assert.ok(create.primaryMuscles.length > 0, `${slug} has no primary muscle`)
    assert.ok(create.tags.length > 0, `${slug} has no tags`)
  }
})

test('a split names a dumbbell exercise, spelled out, and says why', () => {
  for (const split of DUMBBELL_SPLITS) {
    assert.match(split.create.name, /^Dumbbell /, `${split.slug} does not start with "Dumbbell"`)
    assert.deepEqual(
      split.create.equipment.filter((e) => !SUPPORT_EQUIPMENT.has(e)),
      ['dumbbell'],
      `${split.slug} is not a dumbbell exercise`,
    )
    assert.ok(split.movedAliases.length > 0, `${split.slug} moves no alias — then what was it hiding as?`)
    assert.ok(split.repoint.length > 0, `${split.slug} repoints no program`)
    assert.ok(split.note.trim().length > 40, `${split.slug}'s decision is not written down`)
    assert.ok(
      split.create.variations.includes(split.from),
      `${split.slug} is not linked back to ${split.from} as a variation`,
    )
  }
  for (const addition of DUMBBELL_ADDITIONS) {
    assert.ok(addition.note.trim().length > 40, `${addition.slug}'s reason is not written down`)
  }
})

test('nothing the table authors is written in shorthand', () => {
  // The catalog is spelled out now, so a table that mints "DB Swing" would
  // undo the request the same run is applying.
  for (const { slug, create } of TABLE_ENTRIES) {
    assert.equal(usesDumbbellShorthand(create.name), false, `${slug} name`)
    for (const alias of create.aliases) {
      assert.equal(usesDumbbellShorthand(alias), false, `${slug} alias "${alias}"`)
    }
  }
  for (const rename of DUMBBELL_RENAMES) {
    assert.equal(usesDumbbellShorthand(rename.to), false, `${rename.slug} new name`)
    for (const alias of rename.addAliases) {
      assert.equal(usesDumbbellShorthand(alias), false, `${rename.slug} alias "${alias}"`)
    }
  }
})

test('a rename keeps the old name reachable', () => {
  for (const rename of DUMBBELL_RENAMES) {
    assert.ok(
      rename.addAliases.some((a) => a.trim().toLowerCase() === rename.from.trim().toLowerCase()),
      `${rename.slug} drops "${rename.from}" without keeping it as an alias`,
    )
  }
})

test('a repoint never leaves the two dumbbell-only programs', () => {
  for (const id of repointedProgramIds()) {
    assert.ok(
      DUMBBELL_ONLY_PROGRAM_IDS.includes(id),
      `${id} is not one of the dumbbell-only programs — this card does not touch it`,
    )
  }
})

test('every variation and host slug the table names is a real exercise', () => {
  const known = new Set<string>([...CATALOG.map((e) => e.slug), ...TABLE_ENTRIES.map((e) => e.slug)])
  for (const split of DUMBBELL_SPLITS) {
    assert.ok(known.has(split.from), `${split.slug} splits from ${split.from}, which does not exist`)
  }
  for (const { slug, create } of TABLE_ENTRIES) {
    for (const variation of create.variations) {
      assert.ok(known.has(variation), `${slug} lists variation ${variation}, which does not exist`)
      assert.notEqual(variation, slug, `${slug} lists itself as a variation`)
    }
  }
})

// ─── 3. "DB" → "Dumbbell", and the plan ─────────────────────────────────────

test('spellOutDumbbell rewrites the token and nothing else', () => {
  assert.equal(spellOutDumbbell('DB Crunch × 20'), 'Dumbbell Crunch × 20')
  assert.equal(spellOutDumbbell('Standing Calf Raise (with DBs)'), 'Standing Calf Raise (with Dumbbells)')
  assert.equal(spellOutDumbbell('Light DB RDL → Upright Row × 15'), 'Light Dumbbell RDL → Upright Row × 15')
  assert.equal(spellOutDumbbell('Bench Press (DB/bar)'), 'Bench Press (Dumbbell/bar)')
  // Not a word boundary, or not the token at all.
  assert.equal(spellOutDumbbell('Deadlift'), 'Deadlift')
  assert.equal(spellOutDumbbell('Dbl Kettlebell Swing'), 'Dbl Kettlebell Swing')
  assert.equal(spellOutDumbbell('Dumbbell Curl'), 'Dumbbell Curl')
  assert.equal(spellOutDumbbell(''), '')
})

test('spelling out twice is the same as spelling out once', () => {
  for (const text of ['DB Crunch', 'Standing Calf Raise (with DBs)', 'DB DB Row', 'Dumbbell Row']) {
    assert.equal(spellOutDumbbell(spellOutDumbbell(text)), spellOutDumbbell(text), text)
  }
})

test('usesDumbbellShorthand is the question spellOutDumbbell answers', () => {
  assert.equal(usesDumbbellShorthand('DB Crunch'), true)
  assert.equal(usesDumbbellShorthand('db crunch'), true)
  assert.equal(usesDumbbellShorthand('Standing Calf Raise (with DBs)'), true)
  assert.equal(usesDumbbellShorthand('Dumbbell Crunch'), false)
  assert.equal(usesDumbbellShorthand('Dbl Row'), false)
})

test('normalizeAliases spells out, dedupes, and drops a repeat of the name', () => {
  assert.deepEqual(
    normalizeAliases('Dumbbell Row', ['DB Bent-Over Row', 'Dumbbell Bent-Over Row', 'Dumbbell Row', 'Single-Arm Row']),
    ['Dumbbell Bent-Over Row', 'Single-Arm Row'],
  )
  // Case-insensitive, order preserved, blanks dropped.
  assert.deepEqual(normalizeAliases('Push-Up', ['Push-Ups', 'push-ups', '  ', 'Slow Push-Ups']), ['Push-Ups', 'Slow Push-Ups'])
  assert.deepEqual(normalizeAliases('Crunch', []), [])
})

test('the repo catalog is settled — the migration has nothing left to do', () => {
  const plan = planDumbbellCatalog(CATALOG)
  assert.deepEqual(plan.missingSlugs, [], 'the table names slugs the catalog does not hold')
  assert.deepEqual(plan.creates.map((c) => c.slug), [], 'rows still to create')
  assert.deepEqual(plan.hostEdits.map((h) => h.slug), [], 'hosts still to edit')
  assert.deepEqual(plan.renames.map((r) => r.slug), [], 'rows still to rename')
  assert.deepEqual(plan.spellOuts.map((s) => s.slug), [], 'rows still saying "DB"')
  assert.equal(isDumbbellCatalogSettled(plan), true)
})

test('the repo programs are settled too', () => {
  assert.deepEqual(planDumbbellProgramRepoints(PROGRAMS), [], 'references still pointing at the non-dumbbell row')
  assert.deepEqual(
    planDumbbellDetailSpellOuts(PROGRAMS).map((d) => d.from),
    [],
    'protocol blocks still written in shorthand',
  )
})

test('the protocol bullets a member reads say "Dumbbell" too', () => {
  // "Minute 1: 12 DB Push Press" is free text on the workout card, not an
  // exercise reference — so nothing else in this card would have touched it.
  const shorthand: string[] = []
  for (const program of PROGRAMS) {
    for (const phase of program.phases ?? []) {
      for (const workout of phase.workouts ?? []) {
        for (const exercise of workout.exercises ?? []) {
          const details = exercise.details
          if (typeof details === 'string' && usesDumbbellShorthand(details)) {
            shorthand.push(`${program.program_id}: ${details}`)
          }
        }
      }
    }
  }
  assert.deepEqual(shorthand, [])
})

test('the plan is a fixed point: planning a fresh catalog, applying it, re-planning finds nothing', () => {
  // The catalog as it was BEFORE this card, reconstructed from the table: put
  // the moved aliases back on the hosts, drop the new rows, restore the old
  // name. Planning that has to produce exactly the work this card did.
  const before: CatalogRow[] = CATALOG
    .filter((row) => !TABLE_ENTRIES.some((e) => e.slug === row.slug))
    .map((row) => {
      const split = DUMBBELL_SPLITS.find((s) => s.from === row.slug)
      const rename = DUMBBELL_RENAMES.find((r) => r.slug === row.slug)
      return {
        slug: row.slug,
        name: rename ? rename.from : row.name,
        aliases: [...(row.aliases ?? []), ...(split?.movedAliases ?? [])],
        variations: (row.variations ?? []).filter((v) => v !== split?.slug),
        optionalEquipment: split ? [...(row.optionalEquipment ?? []), 'dumbbell'] : row.optionalEquipment,
      }
    })

  const plan = planDumbbellCatalog(before)
  assert.equal(plan.creates.length, TABLE_ENTRIES.length, 'every row in the table gets created')
  assert.equal(plan.hostEdits.length, DUMBBELL_SPLITS.length, 'every host gets edited')
  assert.equal(plan.renames.length, DUMBBELL_RENAMES.length)
  assert.deepEqual(plan.missingSlugs, [])
  for (const edit of plan.hostEdits) {
    assert.deepEqual(edit.removeOptionalEquipment, ['dumbbell'], `${edit.slug} keeps dumbbell as optional equipment`)
  }
})

// ─── Wiring ─────────────────────────────────────────────────────────────────

test('the admin exercise list search expands gym shorthand', () => {
  const src = readSource('app/api/exercises/route.ts')
  assert.match(src, /import \{ expandQueryVariants \} from '@\/lib\/exerciseAbbreviations'/)
  assert.match(src, /const patterns = expandQueryVariants\(q\)\.map\(escapeRegExp\)/)
  assert.match(src, /patterns\.flatMap/)
  // The audit tabs page in memory and go through matchesAuditSearch instead.
  assert.match(src, /matchesAuditSearch\(e, q\)/)
})

test('the migration is idempotent by construction and never touches member history', () => {
  const src = readSource('scripts/dumbbell-catalog.ts')
  // Dry run unless asked, and a fixture mode that needs no database.
  assert.match(src, /const APPLY = process\.argv\.includes\('--apply'\)/)
  assert.match(src, /const FIXTURE = process\.argv\.includes\('--fixture'\)/)
  // It plans with the same function this test does.
  assert.match(src, /planDumbbellCatalog/)
  assert.match(src, /planDumbbellProgramRepoints/)
  // And it re-plans afterwards rather than claiming success.
  assert.match(src, /isDumbbellCatalogSettled/)
  // A split is NOT a relink of a dangling slug: the host is a real exercise
  // six other programs still prescribe, so logs and PRs stay where they are.
  assert.doesNotMatch(src, /UserProgress/)
  assert.doesNotMatch(src, /exercisePRs/)
})
