// Run with: npm run test:file tests/unit/programExerciseRepairs.test.ts
//
// Card: "Exercise do not exist in our data base." The repair table drives a
// one-off write across every production program, so the things that would
// make that write go wrong are checked here rather than discovered halfway
// through the run: a value the Exercise schema would reject, a relink to a
// slug shape that cannot exist, an entry that says both "relink" and
// "create", a duplicate that would be applied twice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import Exercise from '../../models/Exercise'
import { PROGRAM_EXERCISE_REPAIRS, repairFor } from '../../lib/programExerciseRepairs'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The enum a schema path accepts. Array paths ("movementPatterns") keep it
 *  on the element definition rather than on the path itself. */
function enumValues(pathName: string): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const path = Exercise.schema.path(pathName) as any
  const values: string[] = path.enumValues?.length
    ? path.enumValues
    : path.options?.type?.[0]?.enum ?? []
  assert.ok(values.length > 0, `no enum found for ${pathName} — this check is not checking anything`)
  return values
}

test('every entry does exactly one thing', () => {
  for (const r of PROGRAM_EXERCISE_REPAIRS) {
    const actions = [r.relinkTo, r.create].filter(Boolean).length
    assert.equal(actions, 1, `${r.slug} has ${actions} actions, expected exactly 1`)
  }
})

test('no slug is repaired twice', () => {
  const seen = new Set<string>()
  for (const r of PROGRAM_EXERCISE_REPAIRS) {
    assert.equal(seen.has(r.slug), false, `${r.slug} appears twice`)
    seen.add(r.slug)
  }
})

test('every slug on both sides is a real slug shape', () => {
  for (const r of PROGRAM_EXERCISE_REPAIRS) {
    assert.match(r.slug, SLUG, `${r.slug} is not slug-shaped`)
    assert.ok(r.label.trim(), `${r.slug} has no label`)
    if (r.relinkTo) {
      assert.match(r.relinkTo, SLUG, `${r.relinkTo} is not slug-shaped`)
      assert.notEqual(r.relinkTo, r.slug, `${r.slug} relinks to itself`)
    }
  }
})

test('nothing relinks to a slug this table is also creating', () => {
  const created = new Set(PROGRAM_EXERCISE_REPAIRS.filter((r) => r.create).map((r) => r.slug))
  for (const r of PROGRAM_EXERCISE_REPAIRS) {
    if (r.relinkTo) assert.equal(created.has(r.relinkTo), false, `${r.slug} → ${r.relinkTo}, which is itself dangling`)
  }
})

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

  for (const r of PROGRAM_EXERCISE_REPAIRS) {
    if (!r.create) continue
    const c = r.create
    assert.ok(categories.includes(c.category), `${r.slug}: category ${c.category}`)
    assert.ok(mechanics.includes(c.mechanics), `${r.slug}: mechanics ${c.mechanics}`)
    assert.ok(roles.includes(c.role), `${r.slug}: role ${c.role}`)
    assert.ok(lateralities.includes(c.laterality), `${r.slug}: laterality ${c.laterality}`)
    assert.ok(difficulties.includes(c.difficulty), `${r.slug}: difficulty ${c.difficulty}`)
    assert.ok(tracking.includes(c.trackingType), `${r.slug}: trackingType ${c.trackingType}`)
    assert.ok(regions.includes(c.bodyRegion), `${r.slug}: bodyRegion ${c.bodyRegion}`)
    for (const p of c.movementPatterns) assert.ok(patterns.includes(p), `${r.slug}: pattern ${p}`)
    for (const m of [...c.primaryMuscles, ...c.secondaryMuscles]) assert.ok(muscles.includes(m), `${r.slug}: muscle ${m}`)
    for (const e of c.equipment) assert.ok(equipment.includes(e), `${r.slug}: equipment ${e}`)
  }
})

test('a created row is worth creating — name, description and coaching text', () => {
  for (const r of PROGRAM_EXERCISE_REPAIRS) {
    if (!r.create) continue
    assert.ok(r.create.name.trim(), `${r.slug} has no name`)
    assert.ok(r.create.description.trim().length > 20, `${r.slug} has no real description`)
    assert.ok(r.create.instructions.length >= 2, `${r.slug} has ${r.create.instructions.length} instructions`)
    assert.ok(r.create.cues.length >= 1, `${r.slug} has no cues`)
    for (const line of [...r.create.instructions, ...r.create.cues, ...r.create.commonMistakes]) {
      assert.ok(line.trim(), `${r.slug} has an empty coaching line`)
    }
  }
})

test('the four exercises the catalog genuinely lacked are the ones created', () => {
  const created = PROGRAM_EXERCISE_REPAIRS.filter((r) => r.create).map((r) => r.slug).sort()
  assert.deepEqual(created, ['ab-circuit', 'rest', 'sled-push', 'up-downs'])
})

test('every judgement call is written down', () => {
  // These are the ones where the name alone does not settle it, so the
  // reasoning has to survive in the repo rather than in a run log.
  for (const slug of ['russian-deadlift', 'db-squat-press', 'bent-over-cable-kickbacks', 'up-downs']) {
    assert.ok(repairFor(slug)?.note?.trim(), `${slug} has no note explaining the decision`)
  }
})

test('repairFor finds an entry and is silent about anything else', () => {
  assert.equal(repairFor('sled-push')?.create?.name, 'Sled Push')
  assert.equal(repairFor('rowing-sprints')?.relinkTo, 'rowing-machine-sprint')
  assert.equal(repairFor('not-a-real-slug'), undefined)
})
