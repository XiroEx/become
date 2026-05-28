// Run with: npx tsx --test tests/unit/suggestions/applyDismissal.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDismissal } from '../../../lib/suggestions/applyDismissal'
import type { DismissedSuggestion } from '../../../lib/suggestions/types'

const T1 = new Date('2026-05-26T00:00:00Z')
const T2 = new Date('2026-05-28T12:00:00Z')

test('applyDismissal: empty list → appends new entry, wasUpdate=false', () => {
  const { next, wasUpdate } = applyDismissal([], 'log-weight', T1)
  assert.equal(wasUpdate, false)
  assert.deepEqual(next, [{ id: 'log-weight', dismissedAt: T1 }])
})

test('applyDismissal: id not present → appends, wasUpdate=false', () => {
  const existing: DismissedSuggestion[] = [
    { id: 'streak-clap', dismissedAt: T1 },
  ]
  const { next, wasUpdate } = applyDismissal(existing, 'log-weight', T2)
  assert.equal(wasUpdate, false)
  assert.equal(next.length, 2)
  assert.deepEqual(next[1], { id: 'log-weight', dismissedAt: T2 })
})

test('applyDismissal: id already present → updates dismissedAt in place, wasUpdate=true', () => {
  const existing: DismissedSuggestion[] = [
    { id: 'log-weight', dismissedAt: T1 },
    { id: 'streak-clap', dismissedAt: T1 },
  ]
  const { next, wasUpdate } = applyDismissal(existing, 'log-weight', T2)
  assert.equal(wasUpdate, true)
  assert.equal(next.length, 2, 'length should not change on update')
  const updated = next.find((d) => d.id === 'log-weight')
  assert.deepEqual(updated, { id: 'log-weight', dismissedAt: T2 })
  // The other entry is untouched
  const unchanged = next.find((d) => d.id === 'streak-clap')
  assert.deepEqual(unchanged, { id: 'streak-clap', dismissedAt: T1 })
})

test('applyDismissal: does not mutate the input array', () => {
  const existing: DismissedSuggestion[] = [
    { id: 'log-weight', dismissedAt: T1 },
  ]
  const snapshot = JSON.stringify(existing)
  applyDismissal(existing, 'log-weight', T2)
  assert.equal(JSON.stringify(existing), snapshot)
})

test('applyDismissal: repeated calls remain idempotent (length stays 1)', () => {
  let state: DismissedSuggestion[] = []
  for (let i = 0; i < 5; i++) {
    state = applyDismissal(state, 'log-weight', new Date(T1.getTime() + i * 1000)).next
  }
  assert.equal(state.length, 1)
})
