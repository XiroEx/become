// NP-210 (id: a69ae17c): Live's rest timer plays an audible alert IN ADDITION
// TO its existing vibration when the countdown reaches zero.
//
// This repo has no jsdom/testing-library (see trackColumns.test.ts and
// customExerciseBodyweightTracking.test.ts for the same convention): the
// rule itself (restAlert.test.ts) is exercised directly, and this scan pins
// down that LiveWorkoutClient actually wires its rest-completion effect to
// it, and no longer rolls its own vibrate-only alert or its own copy of the
// rest-duration rule.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const LIVE = path.join(
  __dirname,
  '../../app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx',
)
const src = fs.readFileSync(LIVE, 'utf8')

test('Live imports the shared sound-and-vibration alert', () => {
  assert.match(
    src,
    /import \{ fireRestAlert \} from "@\/lib\/workout\/restAlert"/,
    'LiveWorkoutClient must import fireRestAlert from the shared module',
  )
})

test('the rest-completion branch of the rest timer effect calls fireRestAlert', () => {
  const effectMatch = src.match(/\/\/ Rest timer\s*\n\s*useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[isResting, restTimeRemaining\]\);/)
  assert.ok(effectMatch, 'expected to find the rest timer useEffect')
  const effectBody = effectMatch![0]

  assert.match(
    effectBody,
    /restTimeRemaining === 0\) \{[\s\S]*?fireRestAlert\(\);/,
    'the zero-reached branch must call fireRestAlert()',
  )
})

test('Live no longer fires a vibration-only alert (navigator.vibrate is not called directly)', () => {
  assert.doesNotMatch(
    src,
    /navigator\.vibrate\(/,
    'the raw navigator.vibrate call must be gone now that fireRestAlert owns both signals',
  )
})

test('Live reuses the shared rest-duration rule rather than a local copy', () => {
  assert.match(
    src,
    /import \{ getRestDuration as getRestDurationForExercise \} from "@\/lib\/workout\/restDuration"/,
    'LiveWorkoutClient must import the shared rest-duration rule',
  )
  assert.doesNotMatch(
    src,
    /const getSmartRestDefault = /,
    'the smart-rest-default rule must not be redefined locally any more',
  )
  assert.doesNotMatch(
    src,
    /const parseRestTime = /,
    'parseRestTime must not be redefined locally any more',
  )
})
