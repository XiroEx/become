// Run with: npm run test:file tests/unit/avatarRepairDefaults.test.ts
//
// `scripts/repair-dangling-avatars.mjs` resets a member whose uploaded photo is
// gone to the preset onboarding would have given them, and it carries its own
// copy of the goal→icon mapping: it is a plain .mjs run against production with
// nothing but mongoose and the S3 client, so it cannot import a 'use client'
// module full of lucide components.
//
// A silent drift between the two would quietly hand repaired members the wrong
// icon, so the copy is checked against the real one rather than trusted.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { defaultIconForGoal } from '../../lib/reward/icons'
import type { FitnessGoal } from '../../models/User'

const SCRIPT = readFileSync(
  new URL('../../scripts/repair-dangling-avatars.mjs', import.meta.url),
  'utf8',
)

/** The script's GOAL_TO_ICON object literal, parsed out of its source. */
function scriptMapping(): Record<string, string> {
  const block = /const GOAL_TO_ICON = \{([^}]*)\}/.exec(SCRIPT)
  assert.ok(block, 'repair-dangling-avatars.mjs no longer declares GOAL_TO_ICON')
  const pairs: Record<string, string> = {}
  for (const [, goal, icon] of block[1].matchAll(/(\w+):\s*'([^']+)'/g)) {
    pairs[goal] = icon
  }
  return pairs
}

const GOALS: FitnessGoal[] = [
  'lose_weight',
  'gain_muscle',
  'improve_performance',
  'general_health',
  'maintain',
]

test('the repair script maps every fitness goal the way the app does', () => {
  const mapping = scriptMapping()
  assert.equal(Object.keys(mapping).length, GOALS.length)
  for (const goal of GOALS) {
    assert.equal(mapping[goal], defaultIconForGoal(goal), `goal ${goal}`)
  }
})

test('the repair script falls back the same way for a member with no goal', () => {
  const fallback = /const FALLBACK_ICON = '([^']+)'/.exec(SCRIPT)
  assert.ok(fallback, 'repair-dangling-avatars.mjs no longer declares FALLBACK_ICON')
  assert.equal(fallback[1], defaultIconForGoal(null))
})

test('the repair only ever clears a blob-backed avatar, and only on a real 404', () => {
  // Both are safety properties, not style: a remote URL cannot be proven dead
  // from this bucket, and repairing on anything other than "not found" would
  // let one unreachable store wipe every avatar in the database.
  assert.match(SCRIPT, /profileIcon: 'custom', avatarUrl: \{ \$regex: '\^\/api\/blob\/' \}/)
  assert.match(SCRIPT, /status === 404 \|\| err\?\.name === 'NoSuchKey' \|\| err\?\.name === 'NotFound'/)
  assert.match(SCRIPT, /state === 'missing'/)
  // The write re-asserts the URL it found missing, so a member who re-uploaded
  // in between keeps the new photo.
  assert.match(SCRIPT, /filter: \{ _id: d\._id, avatarUrl: d\.avatarUrl \}/)
})
