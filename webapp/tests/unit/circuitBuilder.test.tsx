// Run with: npm run test:file tests/unit/circuitBuilder.test.tsx
//
// Card: "There is no way to make a circuit from the pre workout builder
// screen right here. Right now there is no way to group workouts together to
// make an actual circuit workout. Also if you make a circuit every exercise
// after the first one should agree on sets as the first. The way we have it
// now is that u have to manually choose the sets when u add a new exercise."
//
// Three things had to change on the two pre-workout builder surfaces
// (`SessionBuilder`, the build-your-own screen, and `SessionEditor`, the Edit
// panel on a session's overview):
//
//   1. a group can be declared a CIRCUIT, not only a superset — the grouping
//      gesture used to hardcode `"superset"` and offer nothing else, so a
//      circuit could only ever be assembled mid-session from the live view;
//   2. a group can grow past two, which is what makes it an actual circuit;
//   3. a newly added exercise starts on the FIRST exercise's set count
//      instead of a hardcoded 3, and inside a circuit the count belongs to
//      the whole block.
//
// The pure rules are covered in tests/unit/buildAsYouGo.test.ts. This pins the
// wiring: SessionEditor is rendered (it uses no router), and SessionBuilder —
// which does — is checked at the source level, the same way
// tests/unit/setUnitLabel.test.ts checks its surfaces.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import SessionEditor from '@/components/workout/SessionEditor'
import type { DraftExercise } from '@/lib/quickSession/types'

const ROOT = path.join(__dirname, '../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const noop = () => {}

const draft = (name: string, sets: number, extra: Partial<DraftExercise> = {}): DraftExercise => ({
  exerciseSlug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  trackingType: 'reps_weight',
  sets,
  reps: '8-12',
  ...extra,
})

const GID = 'adhoc-1'
const supersetPair: DraftExercise[] = [
  draft('Jump Rope', 5, { groupId: GID, groupType: 'superset', groupLabel: 'Superset' }),
  draft('Goblet Squat', 3, { groupId: GID, groupType: 'superset', groupLabel: 'Superset' }),
  draft('Curl', 2),
]
const circuitPair: DraftExercise[] = supersetPair.map((ex, i) =>
  i < 2 ? { ...ex, groupType: 'circuit', groupLabel: 'Circuit', sets: 5, groupRounds: 5 } : ex,
)

test('SessionEditor: a group offers Superset AND Circuit, once, on its first member', () => {
  const html = renderToStaticMarkup(
    <SessionEditor title="Leg day" exercises={supersetPair} onSave={noop} onCancel={noop} />,
  )
  // The choice is on the group's head only — one circuit, one control.
  assert.match(html, /data-testid="editor-group-kind-superset-0"/)
  assert.match(html, /data-testid="editor-group-kind-circuit-0"/)
  assert.doesNotMatch(html, /data-testid="editor-group-kind-circuit-1"/)
  // And not on an exercise that is in no group at all.
  assert.doesNotMatch(html, /data-testid="editor-group-kind-circuit-2"/)
  // The kind currently in force is the pressed one.
  assert.match(html, /aria-pressed="true"[^>]*data-testid="editor-group-kind-superset-0"/)
})

test('SessionEditor: the exercise below a group can be pulled into it, so a circuit can pass two', () => {
  const html = renderToStaticMarkup(
    <SessionEditor title="Leg day" exercises={circuitPair} onSave={noop} onCancel={noop} />,
  )
  // Offered on the group's LAST member — the one the newcomer sits behind.
  assert.match(html, /data-testid="editor-group-grow-1"/)
  assert.doesNotMatch(html, /data-testid="editor-group-grow-0"/)
  assert.match(html, /Add the next exercise into the circuit containing Goblet Squat/)
})

test('SessionEditor: a circuit says that its rounds are one number for the block', () => {
  const circuit = renderToStaticMarkup(
    <SessionEditor title="Leg day" exercises={circuitPair} onSave={noop} onCancel={noop} />,
  )
  assert.match(circuit, /data-testid="editor-circuit-note-0"/)
  assert.match(circuit, /A circuit runs every exercise for the same number of rounds/)
  assert.match(circuit, /aria-pressed="true"[^>]*data-testid="editor-group-kind-circuit-0"/)

  // A superset carries no such claim — 5 of one and 3 of the other is fine.
  const superset = renderToStaticMarkup(
    <SessionEditor title="Leg day" exercises={supersetPair} onSave={noop} onCancel={noop} />,
  )
  assert.doesNotMatch(superset, /data-testid="editor-circuit-note-/)
})

test('both builder surfaces take their new exercise\'s set count from the session', () => {
  for (const file of ['components/SessionBuilder.tsx', 'components/workout/SessionEditor.tsx']) {
    const src = readSource(file)
    assert.match(src, /defaultSetsFor\(prev\)/, `${file} should seed a new exercise from the session`)
    assert.doesNotMatch(src, /\bsets: 3,/, `${file} still hardcodes sets: 3 on a newly added exercise`)
  }
})

test('both builder surfaces route a set-count edit through the circuit-aware rule', () => {
  for (const file of ['components/SessionBuilder.tsx', 'components/workout/SessionEditor.tsx']) {
    const src = readSource(file)
    assert.match(src, /setSetsAt\(/, `${file} should edit set counts via setSetsAt so a circuit stays in agreement`)
    assert.match(src, /setGroupKindAt\(/, `${file} should be able to declare a group a circuit`)
    assert.match(src, /addNextIntoGroup\(/, `${file} should be able to grow a group past two`)
  }
})

test('SessionBuilder: the Superset/Circuit choice and the grow control are wired in', () => {
  const src = readSource('components/SessionBuilder.tsx')
  assert.match(src, /builder-group-kind-\$\{k\}-\$\{ex\.exerciseSlug\}/)
  assert.match(src, /builder-group-grow-\$\{ex\.exerciseSlug\}/)
  assert.match(src, /OFFERED_KINDS/)
})

test('the live/track add sheet defaults to the anchor\'s count and locks it for a circuit', () => {
  const src = readSource('components/workout/AddExerciseSheet.tsx')
  // No longer a flat 3 regardless of what the session is already doing.
  assert.doesNotMatch(src, /useState\(3\)/)
  assert.match(src, /anchorSets/)
  assert.match(src, /agreesOnSets\(/)
  assert.match(src, /data-testid="add-exercise-circuit-note"/)
  // Both hosts of the sheet hand it the anchor's count and group kind.
  for (const host of [
    'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx',
    'app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx',
  ]) {
    const hostSrc = readSource(host)
    assert.match(hostSrc, /anchorSets=\{/, `${host} should pass anchorSets`)
    assert.match(hostSrc, /anchorGroupType=\{/, `${host} should pass anchorGroupType`)
  }
})
