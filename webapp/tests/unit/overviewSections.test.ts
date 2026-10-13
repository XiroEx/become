// Run with: npm run test:file tests/unit/overviewSections.test.ts
//
// Two reported bugs in the food picker's default view:
//
//   "Pretty sure we broke barcode scanning. It doesn't show the item, just the
//    default search view, UNLESS the item you scan exists in that default view
//    already."
//
//   "items in default view are repeated across foods, recent, & frequent, which
//    is pretty dumb"

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldShowOverview, pickUnseen } from '../../lib/nutrition/overviewSections'

// ── The barcode regression ──────────────────────────────────────────────────

test('a barcode result beats the default view even though it sets no query', () => {
  // This is the whole bug: the scan fills the results and never touches `query`,
  // so a query-only gate kept showing the default list on top of it.
  assert.equal(
    shouldShowOverview({ activeTab: 'all', query: '', resultCount: 1 }),
    false,
  )
})

test('the default view still shows when there is nothing else', () => {
  assert.equal(shouldShowOverview({ activeTab: 'all', query: '', resultCount: 0 }), true)
  assert.equal(shouldShowOverview({ activeTab: 'all', query: ' ', resultCount: 0 }), true)
  assert.equal(shouldShowOverview({ activeTab: 'all', query: 'a', resultCount: 0 }), true,
    'one character is not a search yet')
})

test('a real search hides the default view', () => {
  assert.equal(shouldShowOverview({ activeTab: 'all', query: 'chicken', resultCount: 0 }), false)
  assert.equal(shouldShowOverview({ activeTab: 'all', query: 'chicken', resultCount: 9 }), false)
})

test('the default view is only for the "all" tab', () => {
  assert.equal(shouldShowOverview({ activeTab: 'foods', query: '', resultCount: 0 }), false)
  assert.equal(shouldShowOverview({ activeTab: 'recent', query: '', resultCount: 0 }), false)
})

// ── The duplicate sections ──────────────────────────────────────────────────

const id = (x: { id: string }) => `food:${x.id}`
const items = (...ids: string[]) => ids.map(i => ({ id: i }))

test('a food claimed by an earlier section does not repeat in a later one', () => {
  const seen = new Set<string>()
  const foods = pickUnseen(items('a', 'b'), id, seen, 5)
  const recent = pickUnseen(items('a', 'c'), id, seen, 5)
  assert.deepEqual(foods.map(f => f.id), ['a', 'b'])
  assert.deepEqual(recent.map(f => f.id), ['c'], '"a" already appeared under Foods')
})

test('a later section BACKFILLS rather than coming up short', () => {
  const seen = new Set<string>()
  pickUnseen(items('a', 'b', 'c'), id, seen, 3)
  // Recent's pool overlaps entirely at the top; it should still return three.
  const recent = pickUnseen(items('a', 'b', 'c', 'd', 'e', 'f'), id, seen, 3)
  assert.deepEqual(recent.map(f => f.id), ['d', 'e', 'f'])
})

test('a section with nothing new left returns empty rather than repeating', () => {
  const seen = new Set<string>()
  pickUnseen(items('a', 'b'), id, seen, 5)
  assert.deepEqual(pickUnseen(items('a', 'b'), id, seen, 5), [])
})

test('the cap is respected even with plenty of unseen candidates', () => {
  const seen = new Set<string>()
  assert.equal(pickUnseen(items('a', 'b', 'c', 'd', 'e', 'f', 'g'), id, seen, 5).length, 5)
})

test('meals cannot collide with foods, because the keys are namespaced', () => {
  // Same underlying ObjectId string in two different collections must not
  // suppress one another.
  const seen = new Set<string>()
  pickUnseen(items('abc'), x => `food:${x.id}`, seen, 5)
  const meals = pickUnseen(items('abc'), x => `meal:${x.id}`, seen, 5)
  assert.deepEqual(meals.map(m => m.id), ['abc'])
})

test('an item with no usable key is skipped rather than blocking the section', () => {
  const seen = new Set<string>()
  const out = pickUnseen(
    [{ id: '' }, { id: 'a' }],
    x => (x.id ? `food:${x.id}` : ''),
    seen, 5,
  )
  assert.deepEqual(out.map(o => o.id), ['a'])
})

test('duplicates WITHIN one section collapse too', () => {
  const seen = new Set<string>()
  assert.deepEqual(pickUnseen(items('a', 'a', 'b'), id, seen, 5).map(f => f.id), ['a', 'b'])
})
