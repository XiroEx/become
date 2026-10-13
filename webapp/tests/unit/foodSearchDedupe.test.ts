// Run with: npm run test:file tests/unit/foodSearchDedupe.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  externalKey,
  buildSeenKeys,
  dedupeBySource,
  type CustomFoodForDedupe,
} from '../../lib/foodSearchDedupe'

// --- externalKey -----------------------------------------------------------

test('externalKey prefixes by source so USDA fdcId cannot collide with OFF code', () => {
  assert.equal(externalKey('usda', '12345'), 'usda:12345')
  assert.equal(externalKey('openfoodfacts', '12345'), 'openfoodfacts:12345')
  assert.notEqual(externalKey('usda', '12345'), externalKey('openfoodfacts', '12345'))
})

// --- buildSeenKeys ---------------------------------------------------------

test('buildSeenKeys handles empty input', () => {
  const seen = buildSeenKeys([])
  assert.equal(seen.size, 0)
})

test('buildSeenKeys collects parent + variant externalIds under parent source', () => {
  const customFoods: CustomFoodForDedupe[] = [
    {
      source: 'usda',
      externalId: '111',
      variants: [{ externalId: '222' }, { externalId: '333' }],
    },
  ]
  const seen = buildSeenKeys(customFoods)
  assert.equal(seen.size, 3)
  assert.ok(seen.has('usda:111'))
  assert.ok(seen.has('usda:222'))
  assert.ok(seen.has('usda:333'))
})

test('buildSeenKeys ignores manual-source customFoods (no upstream id to match)', () => {
  const customFoods: CustomFoodForDedupe[] = [
    { source: 'manual', externalId: '999', variants: [] },
    { source: 'manual', variants: [{ externalId: '888' }] },
  ]
  const seen = buildSeenKeys(customFoods)
  assert.equal(seen.size, 0)
})

test('buildSeenKeys skips variant entries missing or empty externalId', () => {
  const customFoods: CustomFoodForDedupe[] = [
    {
      source: 'usda',
      externalId: '100',
      variants: [
        { externalId: '200' },
        { externalId: '' },
        { externalId: null },
        { externalId: undefined },
        { /* no externalId key */ },
      ],
    },
  ]
  const seen = buildSeenKeys(customFoods)
  assert.equal(seen.size, 2)
  assert.ok(seen.has('usda:100'))
  assert.ok(seen.has('usda:200'))
})

test('buildSeenKeys is idempotent for repeated externalIds', () => {
  const customFoods: CustomFoodForDedupe[] = [
    { source: 'usda', externalId: '111', variants: [{ externalId: '111' }] },
    { source: 'usda', externalId: '111', variants: [{ externalId: '111' }] },
  ]
  const seen = buildSeenKeys(customFoods)
  assert.equal(seen.size, 1)
  assert.ok(seen.has('usda:111'))
})

test('buildSeenKeys keeps USDA vs OFF keys distinct even when ids overlap', () => {
  const customFoods: CustomFoodForDedupe[] = [
    { source: 'usda', externalId: '5000' },
    { source: 'openfoodfacts', externalId: '5000' },
  ]
  const seen = buildSeenKeys(customFoods)
  assert.equal(seen.size, 2)
  assert.ok(seen.has('usda:5000'))
  assert.ok(seen.has('openfoodfacts:5000'))
})

// --- dedupeBySource: core bug regression ----------------------------------

test('dedupeBySource suppresses a duplicate whose owning customFood ranks past the top-5 (rank>5 regression)', () => {
  // Simulate a 20-deep customFoods array. The duplicate-owning customFood
  // sits at rank 19 — past any displayed top-N. Before the fix, the seen-set
  // was only built from the first 5; that USDA dup would have leaked through.
  const customFoods: CustomFoodForDedupe[] = []
  for (let i = 0; i < 20; i++) {
    customFoods.push({
      source: i === 19 ? 'usda' : 'manual',
      externalId: i === 19 ? 'LEAKY-FDC-42' : undefined,
      variants: [],
    })
  }
  const usdaResults = [
    { _id: 'usda-LEAKY-FDC-42', name: 'Should be filtered' },
    { _id: 'usda-other', name: 'Should pass through' },
  ]
  const { usda } = dedupeBySource(customFoods, usdaResults, [])
  assert.equal(usda.length, 1)
  assert.equal(usda[0]._id, 'usda-other')
})

test('dedupeBySource filters by variant externalId at any rank', () => {
  const customFoods: CustomFoodForDedupe[] = [
    {
      source: 'usda',
      externalId: 'parent-1',
      variants: [{ externalId: 'variant-99' }, { externalId: 'variant-100' }],
    },
  ]
  const usdaResults = [
    { _id: 'usda-variant-99', name: 'Filtered by variant' },
    { _id: 'usda-variant-100', name: 'Filtered by variant' },
    { _id: 'usda-passthrough', name: 'Not owned' },
  ]
  const { usda } = dedupeBySource(customFoods, usdaResults, [])
  assert.equal(usda.length, 1)
  assert.equal(usda[0]._id, 'usda-passthrough')
})

test('dedupeBySource source prefix prevents USDA-vs-OFF id collision', () => {
  // Same numeric id "1234" exists as USDA fdcId in our DB and as OFF barcode
  // in the live results. Without source-prefixed keys the OFF result would
  // be wrongly suppressed.
  const customFoods: CustomFoodForDedupe[] = [
    { source: 'usda', externalId: '1234' },
  ]
  const usdaResults = [{ _id: 'usda-1234', name: 'Owned USDA' }]
  const offResults = [{ _id: 'off-1234', name: 'Unrelated OFF product with same barcode digits' }]
  const { usda, off } = dedupeBySource(customFoods, usdaResults, offResults)
  assert.equal(usda.length, 0, 'USDA dup should be filtered')
  assert.equal(off.length, 1, 'OFF result with same numeric id must NOT be filtered')
  assert.equal(off[0]._id, 'off-1234')
})

test('dedupeBySource filters OFF results by parent + variant externalIds', () => {
  const customFoods: CustomFoodForDedupe[] = [
    {
      source: 'openfoodfacts',
      externalId: '0000000001',
      variants: [{ externalId: '0000000002' }],
    },
  ]
  const offResults = [
    { _id: 'off-0000000001', name: 'Owned parent' },
    { _id: 'off-0000000002', name: 'Owned variant' },
    { _id: 'off-9999999999', name: 'Not owned' },
  ]
  const { off } = dedupeBySource(customFoods, [], offResults)
  assert.equal(off.length, 1)
  assert.equal(off[0]._id, 'off-9999999999')
})

test('dedupeBySource passes through external results whose _id is not a usda-/off- string', () => {
  // Some pre-imported items already carry an ObjectId-style _id rather than
  // the synthetic "usda-XXX" / "off-XXX" prefix. The helper must NOT filter
  // them out (it has no way to know whether they collide).
  const customFoods: CustomFoodForDedupe[] = [{ source: 'usda', externalId: 'X' }]
  const usdaResults = [
    { _id: 'usda-X', name: 'Filtered' },
    { _id: '507f1f77bcf86cd799439011', name: 'ObjectId-shaped — must pass through' },
    { _id: undefined, name: 'Missing id — must pass through' },
    { _id: 42, name: 'Numeric id — must pass through' },
  ]
  const { usda } = dedupeBySource(customFoods, usdaResults, [])
  assert.equal(usda.length, 3)
  assert.ok(usda.every(r => r._id !== 'usda-X'))
})

test('dedupeBySource handles empty inputs without throwing', () => {
  const { usda, off, seenKeys } = dedupeBySource([], [], [])
  assert.equal(usda.length, 0)
  assert.equal(off.length, 0)
  assert.equal(seenKeys.size, 0)
})

test('dedupeBySource is idempotent — running it twice yields the same survivors', () => {
  const customFoods: CustomFoodForDedupe[] = [
    { source: 'usda', externalId: 'a', variants: [{ externalId: 'b' }] },
    { source: 'openfoodfacts', externalId: 'c' },
  ]
  const usdaResults = [
    { _id: 'usda-a', n: 1 },
    { _id: 'usda-b', n: 2 },
    { _id: 'usda-d', n: 3 },
  ]
  const offResults = [
    { _id: 'off-c', n: 4 },
    { _id: 'off-e', n: 5 },
  ]
  const first = dedupeBySource(customFoods, usdaResults, offResults)
  const second = dedupeBySource(customFoods, first.usda, first.off)
  assert.deepEqual(first.usda, second.usda)
  assert.deepEqual(first.off, second.off)
})

test('dedupeBySource handles all-three-source overlap correctly', () => {
  // CustomFoods owns one USDA fdcId and one OFF code. Live results contain
  // both dups plus passthrough entries from both sources.
  const customFoods: CustomFoodForDedupe[] = [
    { source: 'usda', externalId: 'OWNED-USDA' },
    { source: 'openfoodfacts', externalId: 'OWNED-OFF' },
  ]
  const usdaResults = [
    { _id: 'usda-OWNED-USDA', name: 'dup' },
    { _id: 'usda-NEW-USDA-A', name: 'new a' },
    { _id: 'usda-NEW-USDA-B', name: 'new b' },
  ]
  const offResults = [
    { _id: 'off-OWNED-OFF', name: 'dup' },
    { _id: 'off-NEW-OFF', name: 'new' },
  ]
  const { usda, off } = dedupeBySource(customFoods, usdaResults, offResults)
  assert.equal(usda.length, 2)
  assert.equal(off.length, 1)
  assert.ok(usda.every(r => r._id !== 'usda-OWNED-USDA'))
  assert.equal(off[0]._id, 'off-NEW-OFF')
})

test('dedupeBySource is a pure function — inputs are not mutated', () => {
  const customFoods: CustomFoodForDedupe[] = [
    { source: 'usda', externalId: 'a', variants: [{ externalId: 'b' }] },
  ]
  const usdaResults = [{ _id: 'usda-a', name: 'dup' }, { _id: 'usda-x', name: 'keep' }]
  const offResults = [{ _id: 'off-y', name: 'keep' }]

  const customFoodsSnapshot = JSON.parse(JSON.stringify(customFoods))
  const usdaSnapshot = JSON.parse(JSON.stringify(usdaResults))
  const offSnapshot = JSON.parse(JSON.stringify(offResults))

  dedupeBySource(customFoods, usdaResults, offResults)

  assert.deepEqual(customFoods, customFoodsSnapshot, 'customFoods must not be mutated')
  assert.deepEqual(usdaResults, usdaSnapshot, 'usdaResults must not be mutated')
  assert.deepEqual(offResults, offSnapshot, 'offResults must not be mutated')
})
