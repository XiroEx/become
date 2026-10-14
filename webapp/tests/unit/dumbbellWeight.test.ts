import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getBellWeightInfo, bellWeightLabel, weightQuickPicks } from '@/lib/workout/dumbbellWeight'

test('equipment drives detection even when the name says nothing about it', () => {
  // The screenshot bug: Chest-Supported Row is a dumbbell exercise, but
  // nothing in its name says "dumbbell" — the old name-regex-only check
  // missed it and showed generic barbell UI.
  const info = getBellWeightInfo({
    name: 'Chest-Supported Row',
    equipment: ['dumbbell', 'incline_bench'],
    laterality: 'bilateral',
    movementPatterns: ['horizontal_pull'],
  })
  assert.equal(info.style, 'dumbbell')
  assert.equal(info.showTotal, true)
})

test('barbell and bodyweight exercises get no bell style', () => {
  assert.equal(getBellWeightInfo({ name: 'Barbell Back Squat', equipment: ['barbell', 'squat_rack'] }).style, null)
  assert.equal(getBellWeightInfo({ name: 'Push-Up', equipment: ['bodyweight'] }).style, null)
  assert.equal(getBellWeightInfo(null).style, null)
  assert.equal(getBellWeightInfo(undefined).style, null)
})

test('an informal alias never overrides equipment that names the load', () => {
  // Found while fixing the "Rear Delt Fly gave me dumbbell metrics" card, and
  // strictly worse than it: the catalog aliases Barbell Bench Press
  // "Bench Press (DB/bar)" and Barbell Back Squat "Barbell or Dumbbell Squat",
  // so the name fallback fired straight through the equipment list. Both of
  // the app's most-logged lifts asked for "Weight per DB (lbs)" and doubled
  // whatever was typed: 135 read back as "= 270 lbs total", on a barbell.
  const bench = getBellWeightInfo({
    name: 'Barbell Bench Press',
    aliases: ['Bench Press', 'Bench Press (DB/bar)'],
    equipment: ['barbell', 'flat_bench'],
  })
  assert.equal(bench.style, null)
  assert.equal(bench.showTotal, false)
  assert.equal(bellWeightLabel(bench.style), 'Weight (lbs)')
  assert.deepEqual(weightQuickPicks(bench.style), [45, 95, 135, 185, 225])

  assert.equal(
    getBellWeightInfo({
      name: 'Barbell Back Squat',
      aliases: ['Barbell or Dumbbell Squat'],
      equipment: ['barbell', 'squat_rack'],
    }).style,
    null,
  )
  // Cable and bodyweight answer the question just as well as a barbell does.
  assert.equal(
    getBellWeightInfo({ name: 'Cable Woodchopper', aliases: ['DB Woodchoppers'], equipment: ['cable'] }).style,
    null,
  )
  assert.equal(
    getBellWeightInfo({ name: 'Crunch', aliases: ['DB Crunch × 20'], equipment: ['bodyweight'] }).style,
    null,
  )
})

test('support-only equipment leaves the question open, so the name may still answer it', () => {
  // A box is not a load. A step-up done with dumbbells is still per-DB, and
  // the alias is the only thing that says so.
  const stepUp = getBellWeightInfo({ name: 'Step-Up', aliases: ['DB Step-Ups'], equipment: ['box'] })
  assert.equal(stepUp.style, 'dumbbell')
})

test('name/alias fallback catches custom exercises with no equipment metadata', () => {
  assert.equal(getBellWeightInfo({ name: 'DB Incline Press' }).style, 'dumbbell')
  assert.equal(getBellWeightInfo({ name: 'My Machine', aliases: ['Kettlebell Windmill'] }).style, 'kettlebell')
  assert.equal(getBellWeightInfo({ name: 'Cable Row' }).style, null)
})

test('unilateral / alternating dumbbell work does not double into a total', () => {
  // Only one dumbbell is loaded on a given rep — doubling overstates it.
  const unilateral = getBellWeightInfo({
    name: 'Single-Arm Dumbbell Row',
    equipment: ['dumbbell'],
    laterality: 'unilateral',
  })
  assert.equal(unilateral.style, 'dumbbell')
  assert.equal(unilateral.showTotal, false)

  const alternating = getBellWeightInfo({
    name: 'Alternating Dumbbell Curl',
    equipment: ['dumbbell'],
    laterality: 'alternating',
  })
  assert.equal(alternating.showTotal, false)
})

test('a single dumbbell held goblet-style does not double either', () => {
  const info = getBellWeightInfo({
    name: 'Goblet Squat',
    equipment: ['dumbbell'],
    laterality: 'bilateral',
    movementPatterns: ['squat'],
  })
  assert.equal(info.style, 'dumbbell')
  assert.equal(info.showTotal, false)
})

test('a carry only ever loads a single implement per side, so no doubling', () => {
  const info = getBellWeightInfo({
    name: 'Suitcase Carry',
    equipment: ['dumbbell'],
    laterality: 'unilateral',
    movementPatterns: ['carry', 'anti_lateral_flexion'],
  })
  assert.equal(info.style, 'dumbbell')
  assert.equal(info.showTotal, false)
})

test('kettlebells default to single-implement (goblet, swings, deadlift)', () => {
  const info = getBellWeightInfo({
    name: 'Kettlebell Swing',
    equipment: ['kettlebell'],
    laterality: 'bilateral',
  })
  assert.equal(info.style, 'kettlebell')
  assert.equal(info.showTotal, false)
})

test('an explicitly double/paired kettlebell exercise does double', () => {
  const info = getBellWeightInfo({
    name: 'Double Kettlebell Front Squat',
    equipment: ['kettlebell'],
  })
  assert.equal(info.style, 'kettlebell')
  assert.equal(info.showTotal, true)
})

test('labels are per-implement, not a generic "Weight"', () => {
  assert.equal(bellWeightLabel('dumbbell'), 'Weight per DB (lbs)')
  assert.equal(bellWeightLabel('kettlebell'), 'Weight per KB (lbs)')
  assert.equal(bellWeightLabel(null), 'Weight (lbs)')
})

// NP-209: a kg member sees kg, not a hardcoded lbs, on every one of these.
test('labels read the member\'s chosen unit when given one', () => {
  assert.equal(bellWeightLabel('dumbbell', 'kg'), 'Weight per DB (kg)')
  assert.equal(bellWeightLabel('kettlebell', 'kg'), 'Weight per KB (kg)')
  assert.equal(bellWeightLabel(null, 'kg'), 'Weight (kg)')
  // Omitting it defaults to 'lbs' — every pre-existing call site (and the
  // native copy, not yet ported) keeps reading exactly as before.
  assert.equal(bellWeightLabel('dumbbell'), bellWeightLabel('dumbbell', 'lbs'))
})

test('quick-pick weights are sane for the implement, not barbell plate math', () => {
  assert.deepEqual(weightQuickPicks('dumbbell'), [10, 20, 30, 40, 50])
  assert.deepEqual(weightQuickPicks('kettlebell'), [18, 26, 35, 44, 53])
  assert.deepEqual(weightQuickPicks(null), [45, 95, 135, 185, 225])
})

// ── The quick picks were pounds while the label said kg ─────────────────────
// (id: 96d40d31 / 96d40d32) NP-209 made `bellWeightLabel` unit-aware and left
// these buttons on the pound ladders, so a kg member read "Weight per DB (kg)"
// over 45/95/135/185/225 kg (99–496 lb) on a barbell.

test('(id: 96d40d31) the quick picks take the unit and default to lbs', () => {
  // Omitting it is the pound ladder, exactly as every pre-existing call site
  // read before — the same approach `bellWeightLabel` took.
  assert.deepEqual(weightQuickPicks('dumbbell'), weightQuickPicks('dumbbell', 'lbs'))
  assert.deepEqual(weightQuickPicks('kettlebell'), weightQuickPicks('kettlebell', 'lbs'))
  assert.deepEqual(weightQuickPicks(null), weightQuickPicks(null, 'lbs'))
  // Explicit lbs is still the ladders the pound member has always had.
  assert.deepEqual(weightQuickPicks('dumbbell', 'lbs'), [10, 20, 30, 40, 50])
  assert.deepEqual(weightQuickPicks('kettlebell', 'lbs'), [18, 26, 35, 44, 53])
  assert.deepEqual(weightQuickPicks(null, 'lbs'), [45, 95, 135, 185, 225])
})

test('(id: 96d40d32) a kg member gets kg equipment ladders, not converted pounds', () => {
  assert.deepEqual(weightQuickPicks(null, 'kg'), [20, 40, 60, 80, 100])
  assert.deepEqual(weightQuickPicks('dumbbell', 'kg'), [5, 10, 15, 20, 25])
  assert.deepEqual(weightQuickPicks('kettlebell', 'kg'), [8, 12, 16, 20, 24])
})

test('(id: 96d40d32) the kg ladders are equipment numbers, not arithmetic', () => {
  // Nothing here is a converted pound: 45 lb ÷ 2.20462 is 20.4 kg, which is
  // not a bar, a plate or a bell. Every kg pick is a whole number a gym
  // actually owns, and none of them is a pound number relabelled.
  for (const style of ['dumbbell', 'kettlebell', null] as const) {
    const kg = weightQuickPicks(style, 'kg')
    const lbs = weightQuickPicks(style, 'lbs')
    assert.equal(kg.length, 5)
    for (const pick of kg) {
      assert.ok(Number.isInteger(pick), `${pick} kg is not a real plate/bell number`)
      assert.ok(pick > 0)
    }
    // Strictly ascending, like the pound ladders.
    assert.deepEqual(kg, [...kg].sort((a, b) => a - b))
    assert.equal(new Set(kg).size, 5)
    // And not the pound ladder with a kg label stuck on it.
    assert.notDeepEqual(kg, lbs)
  }
  // The specific absurdity the card reported: no kg member is offered 135 or
  // 225 "kg" (298 / 496 lb) on a barbell, nor 53 "kg" on a kettlebell.
  assert.ok(!weightQuickPicks(null, 'kg').some((w) => w > 100))
  assert.ok(!weightQuickPicks('kettlebell', 'kg').includes(53))
})

// ── Every call site passes the unit the LABEL uses ──────────────────────────
// (id: 96d40d33) The bug was a call site, not just a signature: the buttons
// under a unit-aware label were still being asked for the default ladder. This
// repo has no jsdom/testing-library, so — matching the precedent in
// trackColumns.test.ts — the JSX is asserted against the source text.

const APP_ROOTS = ['app', 'components', 'hooks', 'lib'] as const

function sourceFiles(): string[] {
  const out: string[] = []
  for (const root of APP_ROOTS) {
    const base = path.join(__dirname, '../..', root)
    if (!fs.existsSync(base)) continue
    for (const rel of fs.readdirSync(base, { recursive: true }) as string[]) {
      const full = path.join(base, String(rel))
      if (!/\.tsx?$/.test(full)) continue
      if (!fs.statSync(full).isFile()) continue
      out.push(full)
    }
  }
  return out
}

/** The second argument of every `fn(...)` call in one source file. */
function unitArgs(source: string, fn: string): string[] {
  const calls = source.match(new RegExp(`${fn}\\(([^)]*)\\)`, 'g')) ?? []
  return calls.map((call) => {
    const args = call.slice(fn.length + 1, -1).split(',')
    return (args[1] ?? '').trim()
  })
}

test('(id: 96d40d33) every weightQuickPicks call site passes the label\'s unit', () => {
  const callers = sourceFiles().filter((f) => {
    if (f.endsWith(path.join('lib', 'workout', 'dumbbellWeight.ts'))) return false
    return /weightQuickPicks\(/.test(fs.readFileSync(f, 'utf8'))
  })
  assert.ok(callers.length > 0, 'no weightQuickPicks call site found — this test has gone stale')

  for (const file of callers) {
    const source = fs.readFileSync(file, 'utf8')
    const where = path.relative(path.join(__dirname, '../..'), file)
    const picks = unitArgs(source, 'weightQuickPicks')
    const labels = unitArgs(source, 'bellWeightLabel')
    for (const unit of picks) {
      assert.notEqual(unit, '', `${where}: weightQuickPicks is still called with no unit`)
      assert.ok(
        labels.includes(unit),
        `${where}: the quick picks read \`${unit}\` but the label reads \`${labels.join('`, `')}\``
          + ' — the buttons and the label they sit under must be the same unit',
      )
    }
  }
})
