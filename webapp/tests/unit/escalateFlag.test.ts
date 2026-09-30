// Run with: npm run test:file tests/unit/escalateFlag.test.ts
//
// When the machine confirms a record the member's photo contradicts, that is
// not a settled question — it is one the machine cannot settle, because our row
// and every source it consulted can be copies of the same stale figure.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldEscalate, ESCALATION_RECIPIENTS } from '../../lib/nutrition/escalateFlag'

test('no change + member photo goes to a human', () => {
  assert.equal(shouldEscalate({ changed: false, photoCount: 1, alreadyEscalated: false }), true)
})

test('a correction does not need a human — the record already moved', () => {
  assert.equal(shouldEscalate({ changed: true, photoCount: 3, alreadyEscalated: false }), false)
})

test('no change with no photo is a fair no change', () => {
  // Nothing here a person has that the reviewer did not. Escalating a bare
  // "looks wrong" would bury the reports that carry actual evidence.
  assert.equal(shouldEscalate({ changed: false, photoCount: 0, alreadyEscalated: false }), false)
})

test('a flag is escalated once, not on every re-review', () => {
  assert.equal(shouldEscalate({ changed: false, photoCount: 2, alreadyEscalated: true }), false)
})

test('both inboxes are on it', () => {
  assert.deepEqual(ESCALATION_RECIPIENTS, ['george@redbtn.io', 'info@becomeurbest.com'])
})
