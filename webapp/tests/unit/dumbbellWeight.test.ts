import test from 'node:test'
import assert from 'node:assert/strict'
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

test('quick-pick weights are sane for the implement, not barbell plate math', () => {
  assert.deepEqual(weightQuickPicks('dumbbell'), [10, 20, 30, 40, 50])
  assert.deepEqual(weightQuickPicks('kettlebell'), [18, 26, 35, 44, 53])
  assert.deepEqual(weightQuickPicks(null), [45, 95, 135, 185, 225])
})
