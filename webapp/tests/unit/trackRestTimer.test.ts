// NP-210 (id: a69ae17d, a69ae17e): the Track view gets its own rest timer,
// started after a set is marked done, reusing Live's rest-duration rule
// (getSmartRestDefault / getRestDuration, now shared from
// @/lib/workout/restDuration — see restDuration.test.ts) rather than a
// second rest rule, and firing the same sound-and-vibration alert at zero
// (restAlert.test.ts) that Live fires (liveRestAlert.test.ts).
//
// This repo has no jsdom/testing-library (see trackColumns.test.ts and
// customExerciseBodyweightTracking.test.ts for the same convention): the
// pure rule and the pure alert are each exercised directly in their own
// test files, and this is the source scan that pins WorkoutFormClient to
// actually wiring itself up to both.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const TRACK = path.join(
  __dirname,
  '../../app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx',
)
const src = fs.readFileSync(TRACK, 'utf8')

test('Track reuses the shared rest-duration rule — not a second rule', () => {
  assert.match(
    src,
    /import \{ getRestDuration, restGroupContext \} from "@\/lib\/workout\/restDuration"/,
    'WorkoutFormClient must import getRestDuration/restGroupContext from the shared module',
  )
  assert.doesNotMatch(
    src,
    /const getSmartRestDefault\s*=/,
    'Track must not define its own copy of the smart-rest-default rule',
  )
  assert.doesNotMatch(
    src,
    /function getRestDuration\(/,
    'Track must not define its own getRestDuration — only the shared import',
  )
})

test('Track imports the shared sound-and-vibration alert', () => {
  assert.match(
    src,
    /import \{ fireRestAlert \} from "@\/lib\/workout\/restAlert"/,
    'WorkoutFormClient must import fireRestAlert from the shared module',
  )
})

test('Track has its own rest-timer state, started when a set is marked done (not un-checked)', () => {
  assert.match(
    src,
    /const \[restTimer, setRestTimer\] = useState</,
    'Track needs rest-timer state to count down and render',
  )

  const toggleMatch = src.match(/const toggleSetComplete = \(exerciseIndex: number, setIndex: number\) => \{[\s\S]*?\n {2}\};/)
  assert.ok(toggleMatch, 'expected to find toggleSetComplete')
  const body = toggleMatch![0]

  assert.match(
    body,
    /const wasCompleted = progress\.sets\[setIndex\]\.completed;/,
    'must know whether the set was already complete, so un-checking a set does not restart rest',
  )
  assert.match(
    body,
    /if \(!wasCompleted && workout\) \{/,
    'the rest timer must only start on the TO-complete transition',
  )
  assert.match(
    body,
    /getRestDuration\(exercise, restGroupContext\(workout\.exercises, exerciseIndex\)\)/,
    'the duration must come from the shared rule, given this exercise\'s real group context',
  )
  assert.match(
    body,
    /setRestTimer\(\{ exerciseIndex, remaining: duration, total: duration \}\)/,
    'completing a set with rest > 0 must start the timer',
  )
})

test('Track counts the timer down and fires the shared alert at zero', () => {
  const effectMatch = src.match(/useEffect\(\(\) => \{\s*\n\s*if \(!restTimer\) return;[\s\S]*?\n {2}\}, \[restTimer\]\);/)
  assert.ok(effectMatch, 'expected to find the rest-timer countdown effect')
  const body = effectMatch![0]

  assert.match(
    body,
    /if \(restTimer\.remaining <= 0\) \{\s*\n\s*fireRestAlert\(\);/,
    'reaching zero must call fireRestAlert (both sound and vibration)',
  )
  assert.match(
    body,
    /setInterval\(\(\) => \{\s*\n\s*setRestTimer\(\(prev\) => \(prev \? \{ \.\.\.prev, remaining: prev\.remaining - 1 \} : prev\)\);/,
    'must actually count down once a second',
  )
})

test('Track renders the running rest timer with a way to skip it', () => {
  assert.match(
    src,
    /data-testid="track-rest-timer"/,
    'the rest timer needs a stable hook for its own tests/QA',
  )
  assert.match(src, /data-testid="track-rest-remaining"/)
  assert.match(
    src,
    /onClick=\{skipRest\}[\s\S]{0,80}data-testid="track-rest-skip"/,
    'a member must be able to skip the rest they started',
  )
})
