// Run with: npx tsx --test tests/unit/usdaBarcode.test.ts
//
// USDA stores gtinUpc zero-padded to 14 digits and its search matches the
// stored string, so a scanned 12-digit UPC-A finds nothing. Swanson Sipping
// Bone Broth (051000269348) is the case that exposed it: USDA has the product
// with the correct label (16 kcal/100 g) under 00051000269348, the lookup asked
// for 051000269348, got zero hits, and the scan fell through to OpenFoodFacts —
// whose kcal field for this product is wrong by ~5x. The member saw 271 cal for
// a cup of broth that is really about 50.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { usdaGtinCandidates } from '../../lib/usda'

test('a scanned UPC-A yields the 14-digit form USDA actually stores', () => {
  const candidates = usdaGtinCandidates('051000269348')
  assert.ok(
    candidates.includes('00051000269348'),
    `expected the padded GTIN-14, got ${JSON.stringify(candidates)}`,
  )
  // The as-scanned form is still tried — some entries are stored unpadded.
  assert.ok(candidates.includes('051000269348'))
})

test('the canonical padded form is tried first', () => {
  assert.equal(usdaGtinCandidates('051000269348')[0], '00051000269348')
})

test('padding is normalised, not accumulated', () => {
  // Every representation of one barcode resolves to the same canonical form and
  // the same stripped form. The sets differ only by the as-scanned string,
  // which is always kept so an unpadded USDA entry is still reachable.
  for (const code of ['051000269348', '0051000269348', '00051000269348']) {
    const c = usdaGtinCandidates(code)
    assert.equal(c[0], '00051000269348', `canonical form for ${code}`)
    assert.ok(c.includes('51000269348'), `stripped form for ${code}`)
    assert.ok(c.includes(code), `as-scanned form for ${code}`)
  }
})

test('candidates are unique and none exceed 14 digits', () => {
  for (const code of ['051000269348', '0014113734066', '12345678', '00051000269348']) {
    const c = usdaGtinCandidates(code)
    assert.equal(c.length, new Set(c).size, `duplicates for ${code}`)
    for (const v of c) assert.ok(v.length <= 14, `${v} too long for ${code}`)
  }
})

test('non-digits are stripped and empty input yields nothing', () => {
  assert.deepEqual(usdaGtinCandidates(''), [])
  assert.deepEqual(usdaGtinCandidates('   '), [])
  assert.ok(usdaGtinCandidates('0-5100-02693-48').includes('00051000269348'))
})

test('an all-zero code does not collapse to an empty string', () => {
  const c = usdaGtinCandidates('0000')
  assert.ok(c.length > 0)
  assert.ok(c.every((v) => v.length > 0))
})
