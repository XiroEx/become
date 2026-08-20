// Run with: npx tsx --test tests/unit/customExerciseTrackingType.test.ts
//
// Every surface that can create a brand-new exercise on the spot — the
// "Create X" affordance in the live-workout / track-view add-exercise sheet,
// and the same affordance in the build-your-own session builder — used to
// hardcode `trackingType: 'reps_weight'` in the POST to /api/exercises/custom.
// A member who created "Stairmaster" mid-workout (a timed cardio machine, not
// a sets-and-reps lift) got an exercise permanently locked to sets & reps,
// with no way to fix it short of deleting and recreating it from the library.
//
// This scans the source rather than rendering the components: neither surface
// has interaction-test infra (no jsdom/testing-library in this repo), and a
// source scan pins down the exact regression — a hardcoded literal in the
// create-custom-exercise POST body — without needing to build that infra for
// one fix.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

// Mirrors the allowlist in app/api/exercises/custom/route.ts — if that list
// ever changes, this is the other half that needs to stay in sync.
const API_VALID_TRACKING_TYPES = [
  'reps_weight', 'reps_bodyweight', 'reps_only', 'time', 'time_distance', 'intervals', 'none',
]

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function extractTrackingOptionValues(src: string): string[] {
  const block = src.match(/CUSTOM_TRACKING_OPTIONS[^=]*=\s*\[([\s\S]*?)\n\]/)
  assert.ok(block, 'CUSTOM_TRACKING_OPTIONS array not found in source')
  const values = [...block![1].matchAll(/value:\s*["'](\w+)["']/g)].map((m) => m[1])
  assert.ok(values.length > 1, 'expected the picker to offer more than one tracking type')
  return values
}

function extractCreateCustomCall(src: string): string {
  // There are two fetch('/api/exercises/custom', ...) calls per file: a GET
  // (load existing customs) and the POST (create one). Only the POST — the
  // one with a method + body — is the create call this test cares about.
  const calls = [...src.matchAll(/fetch\(['"]\/api\/exercises\/custom['"],\s*\{[\s\S]*?\n\s*\}\)/g)]
  const post = calls.find((m) => /method:\s*["']POST["']/.test(m[0]))
  assert.ok(post, 'POST /api/exercises/custom call not found')
  return post![0]
}

const SURFACES = [
  {
    label: 'AddExerciseSheet (live workout + track view "add exercise" sheet)',
    file: 'components/workout/AddExerciseSheet.tsx',
    stateVar: 'customType',
  },
  {
    label: 'SessionBuilder (build-your-own session)',
    file: 'components/SessionBuilder.tsx',
    stateVar: 'newTrackingType',
  },
]

for (const { label, file, stateVar } of SURFACES) {
  test(`${label}: the "create custom exercise" tracking-type picker only offers values the API accepts`, () => {
    const src = readSource(file)
    const values = extractTrackingOptionValues(src)
    for (const v of values) {
      assert.ok(
        API_VALID_TRACKING_TYPES.includes(v),
        `"${v}" is offered by the picker but is not a tracking type /api/exercises/custom accepts`,
      )
    }
  })

  test(`REGRESSION: ${label} no longer hardcodes trackingType when creating a custom exercise`, () => {
    const src = readSource(file)
    const call = extractCreateCustomCall(src)
    assert.doesNotMatch(
      call,
      /trackingType:\s*['"]reps_weight['"]/,
      'the stairmaster bug: exercise creation was locked to reps_weight regardless of what the member picked',
    )
    const stateVarRef = new RegExp(`trackingType:\\s*${stateVar}\\b`)
    assert.match(call, stateVarRef, `expected the POST body to send the picked tracking type (${stateVar})`)
  })

  test(`REGRESSION: ${label} no longer hardcodes category to "strength" when creating a custom exercise`, () => {
    // Half-fixed the first time around: trackingType stopped being hardcoded,
    // but category still was — so a custom Stairmaster with trackingType
    // 'time_distance' still landed in the catalog as category 'strength' and
    // was invisible to anything that filters by category (the Quick Session
    // cardio finisher, admin exercise browsing).
    const src = readSource(file)
    const call = extractCreateCustomCall(src)
    assert.doesNotMatch(
      call,
      /category:\s*['"]strength['"]/,
      'category is hardcoded to strength regardless of the picked tracking type',
    )
    assert.match(
      call,
      /category:\s*categoryForTracking\(/,
      'expected the POST body to derive category from the picked tracking type via categoryForTracking()',
    )
  })
}
