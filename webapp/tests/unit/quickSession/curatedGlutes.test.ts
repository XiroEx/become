// Run with: npm run test:file tests/unit/quickSession/curatedGlutes.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { curatedGlutesSession } from '../../../lib/quickSession/curatedGlutes'

test('curated glutes session matches the coach-specified workout', () => {
  const session = curatedGlutesSession()

  assert.equal(session.title, 'Glutes Session')
  assert.equal(session.focus, 'glutes')
  assert.equal(session.exercises.length, 6)

  const bySlug = new Map(session.exercises.map((ex) => [ex.exerciseSlug, ex]))

  assert.deepEqual(
    session.exercises.map((ex) => ex.exerciseSlug),
    ['belt-squat', 'hip-thrust', 'b-stance-rdl', 'step-up', 'hyperextension', 'hip-abduction-machine'],
  )

  const beltSquat = bySlug.get('belt-squat')!
  assert.equal(beltSquat.sets, 3)
  assert.equal(beltSquat.reps, '10')

  const hipThrust = bySlug.get('hip-thrust')!
  assert.equal(hipThrust.sets, 3)
  assert.equal(hipThrust.reps, '12')

  const hyperextension = bySlug.get('hyperextension')!
  assert.equal(hyperextension.sets, 3)
  assert.equal(hyperextension.reps, '12')

  const hipAbduction = bySlug.get('hip-abduction-machine')!
  assert.equal(hipAbduction.sets, 3)
})

test('b-stance RDL and step-up are grouped as a superset', () => {
  const session = curatedGlutesSession()
  const bystance = session.exercises.find((ex) => ex.exerciseSlug === 'b-stance-rdl')!
  const stepUp = session.exercises.find((ex) => ex.exerciseSlug === 'step-up')!

  assert.equal(bystance.groupType, 'superset')
  assert.equal(stepUp.groupType, 'superset')
  assert.ok(bystance.groupId)
  assert.equal(bystance.groupId, stepUp.groupId)

  // Sets/reps per leg, as specified ("3x8 each leg").
  assert.equal(bystance.sets, 3)
  assert.equal(bystance.reps, '8 per side')
  assert.equal(stepUp.sets, 3)
  assert.equal(stepUp.reps, '8 per side')

  // No other exercise in the session is grouped.
  const others = session.exercises.filter(
    (ex) => ex.exerciseSlug !== 'b-stance-rdl' && ex.exerciseSlug !== 'step-up',
  )
  assert.ok(others.every((ex) => !ex.groupId))
})
