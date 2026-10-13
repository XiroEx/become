// Run with: npm run test:file tests/unit/equipmentVariant.test.ts
//
// The card: a Workout Now session on "Rear Delt Fly" asked for "Weight per DB
// (lbs)" and reported "= 95 lbs total". The catalog's `rear-delt-fly` is the
// dumbbell one, so the number was right for a dumbbell and wrong for the rear
// delt machine — and the screen never said which the app had chosen, nor
// offered the machine or cable way of doing the same movement.
//
// These pin the rule that decides when the app is guessing
// (lib/workout/equipmentVariant.ts) and the wiring that makes the guess
// visible where the member actually is.
//
// The follow-up card removed the second half of that answer — the row of
// "same movement, other equipment" chips that sat beside the disclosure:
// "I do not like all of those tabs on the live screen. For example I am doing
// a goblet squats why am I getting machine, barbell or any of the names. It
// should just be a dumbbell... I think u should have tabs that are appropriate
// for that particular exercise only when your adding a new workout." The
// disclosure stays (it is what keeps "Weight per DB" from being a mystery);
// the chips are gone from the live screen and equipment choice lives where an
// exercise is picked.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  equipmentAssumption,
  implementLabel,
  loadStyleOf,
  nameStatesLoadStyle,
} from '@/lib/workout/equipmentVariant'
import { getBellWeightInfo } from '@/lib/workout/dumbbellWeight'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── The reported case ──────────────────────────────────────────────────────

test("the card's exercise: Rear Delt Fly is logged as a dumbbell without saying so", () => {
  const a = equipmentAssumption({ name: 'Rear Delt Fly', equipment: ['dumbbell'] })
  assert.equal(a.style, 'dumbbell')
  assert.equal(a.label, 'Dumbbell')
  assert.equal(a.assumed, true, 'nothing in "Rear Delt Fly" says dumbbell, so the app is guessing')
})

test('a name that already states the implement is not an assumption', () => {
  for (const [name, equipment] of [
    ['Dumbbell Bench Press', ['dumbbell', 'flat_bench']],
    ['DB Incline Press', ['dumbbell', 'incline_bench']],
    ['Kettlebell Swing', ['kettlebell']],
    ['Barbell Back Squat', ['barbell', 'squat_rack']],
    ['Cable Row', ['cable']],
    ['Band Pull-Apart', ['resistance_band']],
  ] as Array<[string, string[]]>) {
    assert.equal(
      equipmentAssumption({ name, equipment }).assumed,
      false,
      `${name} states its own equipment — a chip there is chrome`,
    )
  }
})

test('machine names a lifter already reads as machines are self-disclosing', () => {
  // "Lat Pulldown" is tagged `lat_pulldown`, not `machine`. The test is
  // whether the NAME would surprise anyone, not whether it contains the
  // literal equipment token.
  for (const [name, equipment] of [
    ['Lat Pulldown', ['lat_pulldown']],
    ['Leg Press', ['leg_press']],
    ['Pec Deck', ['pec_deck']],
    ['Smith Machine Squat', ['smith_machine']],
    ['Rear Delt Fly Machine', ['rear_delt_machine']],
  ] as Array<[string, string[]]>) {
    assert.equal(equipmentAssumption({ name, equipment }).assumed, false, name)
  }
})

test('an alias nobody can see does not count as the app having said so', () => {
  // The catalog's rear-delt-fly is aliased "Dumbbell Rear Delt Fly". The
  // member was shown "Rear Delt Fly". Reading aliases here would declare the
  // exact reported bug already explained.
  const a = equipmentAssumption({ name: 'Rear Delt Fly', equipment: ['dumbbell'] })
  assert.equal(a.assumed, true)
  assert.equal(nameStatesLoadStyle('Rear Delt Fly', ['Dumbbell Rear Delt Fly']), 'dumbbell')
})

test('a name that contradicts the metadata is surfaced, not hidden', () => {
  // Bad catalog data, and the member is the one who can route around it.
  const a = equipmentAssumption({ name: 'Cable Rear Delt Fly', equipment: ['dumbbell'] })
  assert.equal(a.style, 'dumbbell')
  assert.equal(a.assumed, true)
})

// ─── What counts as load ────────────────────────────────────────────────────

test('support gear never answers "what am I lifting?"', () => {
  assert.equal(loadStyleOf(['flat_bench', 'barbell']), 'barbell', 'the bench is skipped, the bar is the load')
  assert.equal(loadStyleOf(['incline_bench']), null)
  assert.equal(loadStyleOf(['exercise_mat']), null)
  assert.equal(loadStyleOf(['squat_rack', 'box']), null)
  assert.equal(loadStyleOf([]), null)
  assert.equal(loadStyleOf(undefined), null)
})

test('cardio machines carry no weight input, so they are not an implement assumption', () => {
  for (const eq of ['treadmill', 'stationary_bike', 'rowing_machine', 'assault_bike', 'elliptical']) {
    assert.equal(loadStyleOf([eq]), null, eq)
    assert.equal(equipmentAssumption({ name: 'Steady State', equipment: [eq] }).assumed, false, eq)
  }
})

test('bodyweight is never an assumption — there is no external load to get wrong', () => {
  const a = equipmentAssumption({ name: 'Push-Up', equipment: ['bodyweight', 'exercise_mat'] })
  assert.equal(a.style, 'bodyweight')
  assert.equal(a.assumed, false)
})

test('a chest-supported row is a dumbbell exercise whose name says nothing', () => {
  // The case lib/workout/dumbbellWeight.ts exists for: per-DB is CORRECT here,
  // and showing why is the point — not suppressing it.
  const a = equipmentAssumption({ name: 'Chest-Supported Row', equipment: ['dumbbell', 'incline_bench'] })
  assert.equal(a.style, 'dumbbell')
  assert.equal(a.assumed, true)
})

test('an implement inferred from an alias is just as invisible, so it is flagged too', () => {
  // Step-Up is equipment ['box'] — a box is not a load — with the alias
  // "DB Step-Ups". dumbbellWeight.ts resolves that to per-DB, so this must
  // resolve it the same way or the chip goes missing on the one case where
  // the member has the least to go on.
  const a = equipmentAssumption({ name: 'Step-Up', aliases: ['DB Step-Ups'], equipment: ['box'] })
  assert.equal(a.style, 'dumbbell')
  assert.equal(a.assumed, true)
  // ...but an alias never DISCLOSES: the name on screen still says nothing.
  assert.equal(equipmentAssumption({ name: 'Step-Up', aliases: ['DB Step-Ups'] }).assumed, true)
  // A name that says it itself is disclosed, alias or no alias.
  assert.equal(equipmentAssumption({ name: 'DB Step-Ups', aliases: ['Step-Up'] }).assumed, false)
})

test('an exercise with no equipment metadata makes no claim at all', () => {
  assert.equal(equipmentAssumption({ name: 'My Weird Lift' }).assumed, false)
  assert.equal(equipmentAssumption(null).style, null)
  assert.equal(equipmentAssumption(undefined).assumed, false)
})

test('nameStatesLoadStyle can read aliases, and matches on word boundaries', () => {
  assert.equal(nameStatesLoadStyle('Rear Delt Fly'), null)
  assert.equal(nameStatesLoadStyle('Rear Delt Fly', ['DB Reverse Fly']), 'dumbbell')
  assert.equal(nameStatesLoadStyle('Hex Bar Deadlift'), 'barbell')
  assert.equal(nameStatesLoadStyle('Banded Hip Abduction'), 'band')
  assert.equal(nameStatesLoadStyle(''), null)
  assert.equal(nameStatesLoadStyle(undefined), null)
})

test('implementLabel is what a list shows next to a name', () => {
  assert.equal(implementLabel(['dumbbell']), 'Dumbbell')
  assert.equal(implementLabel(['rear_delt_machine']), 'Machine')
  assert.equal(implementLabel(['cable']), 'Cable')
  assert.equal(implementLabel(['incline_bench']), null)
})

// ─── The card: a goblet squat is a dumbbell, and that is all the screen says ──

test('Goblet Squat is understood as a dumbbell movement', () => {
  const a = equipmentAssumption({ name: 'Goblet Squat', equipment: ['dumbbell'] })
  assert.equal(a.style, 'dumbbell')
  assert.equal(a.label, 'Dumbbell')
  // The name does not contain "dumbbell", so the screen still says which
  // implement the weight fields are being read as — one chip, no alternatives.
  assert.equal(a.assumed, true)
})

// ─── The invariant, against the real catalog ────────────────────────────────

test('the per-dumbbell convention is never applied invisibly, for any catalog exercise', () => {
  // The bug was not that per-DB was wrong. It was that per-DB was applied with
  // nothing on screen explaining it. So: wherever dumbbellWeight.ts asserts a
  // bell style, either the exercise's own name says so, or equipmentAssumption
  // flags it and the live screen shows a chip. There is no third case.
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, '..', 'data', 'exercises.json'), 'utf8'),
  ) as Array<{ name: string; aliases?: string[]; equipment?: string[]; laterality?: string; movementPatterns?: string[] }>

  assert.ok(Array.isArray(catalog) && catalog.length > 0, 'catalog fixture loaded')

  const silent: string[] = []
  for (const ex of catalog) {
    const bell = getBellWeightInfo(ex)
    if (!bell.style) continue
    // Name only — an alias is not on the screen the member is looking at.
    const statedByName = nameStatesLoadStyle(ex.name) === bell.style
    const flagged = equipmentAssumption(ex).assumed
    if (!statedByName && !flagged) silent.push(ex.name)
  }
  assert.deepEqual(silent, [], 'these apply per-DB/KB metrics with nothing telling the member')
})

test('the catalog entry from the card is flagged', () => {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, '..', 'data', 'exercises.json'), 'utf8'),
  ) as Array<{ slug: string; name: string; equipment?: string[] }>
  const rearDelt = catalog.find((e) => e.slug === 'rear-delt-fly')
  assert.ok(rearDelt, 'rear-delt-fly is in the catalog')
  assert.equal(equipmentAssumption(rearDelt!).assumed, true)
  assert.equal(equipmentAssumption(rearDelt!).label, 'Dumbbell')
})

// ─── Wiring ─────────────────────────────────────────────────────────────────

test('the variations API carries what an in-place swap needs', () => {
  // handleSwapExercise writes `category` onto the exercise's `type` and
  // re-derives the weight convention from movementPatterns + equipment. A
  // variation missing either silently swaps in a half-populated exercise.
  const src = readSource('app/api/exercises/variations/route.ts')
  assert.match(src, /const VARIATION_FIELDS =\s*\n?\s*'[^']*\bcategory\b[^']*'/)
  assert.match(src, /const VARIATION_FIELDS =\s*\n?\s*'[^']*\bmovementPatterns\b[^']*'/)
  assert.match(src, /category: source\.category as string/)
  assert.match(src, /category: ex\.category as string/)
  assert.match(src, /movementPatterns: \(source\.movementPatterns \?\? \[\]\)/)
  assert.match(src, /movementPatterns: \(ex\.movementPatterns \?\? \[\]\)/)
})

test('the live workout discloses the implement and offers no equipment tabs', () => {
  const src = readSource('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  assert.match(src, /import EquipmentAssumptionRow from "@\/components\/workout\/EquipmentAssumptionRow"/)
  assert.match(src, /<EquipmentAssumptionRow/)
  assert.match(src, /name=\{currentExercise\?\.name\}/)
  assert.match(src, /equipment=\{currentExercise\?\.equipment\}/)
  // The card: no "switch to the barbell / the machine" chips under a live set.
  const row = src.slice(src.indexOf('<EquipmentAssumptionRow'))
  const tag = row.slice(0, row.indexOf('/>') + 2)
  assert.doesNotMatch(tag, /onPick=/, 'the live row must not offer an equipment switch')
  assert.doesNotMatch(tag, /canSwitch=/)
  assert.doesNotMatch(tag, /slug=/, 'nothing is fetched for the disclosure')
})

test('the assumption row is a disclosure, not a picker', () => {
  const src = readSource('components/workout/EquipmentAssumptionRow.tsx')
  // One chip, gated on the assumption alone.
  assert.match(src, /if \(!assumption\.assumed \|\| !assumption\.label\) return null/)
  assert.match(src, /Logging as \{assumption\.label\}/)
  // No variations request, no other-equipment chips, no props that imply one.
  assert.doesNotMatch(src, /fetch\(/, 'the row renders off metadata the caller already has')
  assert.doesNotMatch(src, /\/api\/exercises\/variations/)
  assert.doesNotMatch(src, /\bonPick\b/)
  assert.doesNotMatch(src, /\bcanSwitch\b/)
})

test('changing equipment still has a home — swap, and the add/builder pickers', () => {
  // Removing the live chips must not strand the member: the Swap Exercise
  // modal is on the same screen, and "Add an exercise" keeps the variation
  // picker, which is the "adding a new workout" surface the card names.
  const live = readSource('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  assert.match(live, /<ExerciseSwapModal/)
  assert.match(live, /Swap Exercise/)

  const addSheet = readSource('components/workout/AddExerciseSheet.tsx')
  assert.match(addSheet, /<ExerciseVariationPicker/)
})

test('the quick-session builder shows which implement each result is', () => {
  // Where "Rear Delt Fly" was picked in the first place: the row said only
  // "reps weight", so the dumbbell entry and the machine entry read identically.
  const src = readSource('components/SessionBuilder.tsx')
  assert.match(src, /import \{ implementLabel \} from "@\/lib\/workout\/equipmentVariant"/)
  assert.match(src, /implementLabel\(r\.equipment\)/)
  assert.match(src, /implementLabel\(ex\.equipment\)/)
})
