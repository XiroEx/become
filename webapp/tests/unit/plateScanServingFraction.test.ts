// Run with: npx tsx --test tests/unit/plateScanServingFraction.test.ts
//
// Bug report: a food whose real serving is "3/4 cup" was logged/displayed as
// "1 cup" instead. Root cause — the AI plate-scan review's serving parser
// (SnapPlateModal.tsx `parseServing`) used a hand-rolled regex that only
// recognized digits and a decimal point ([\d.]+), so a fractional estimate
// like "3/4 cup" read as qty=3 with the unit garbled to "/4 cup": the "/"
// falls outside that character class and truncates the number early.
//
// The fix routes real units through `parseQuantityString` (lib/units.ts),
// which already understands ascii fractions ("3/4"), unicode glyphs ("¾"),
// and mixed forms ("1 1/2") — it's the same parser the rest of the
// serving-picker trusts. This test exercises that parser directly against
// the exact strings an AI estimate can produce, and asserts the component
// actually wired it in (so a future edit can't silently regress to the old
// regex without a test noticing).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseQuantityString } from '../../lib/units'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

test('a fractional AI serving parses to the correct quantity, not a truncated one', () => {
  assert.deepEqual(parseQuantityString('3/4 cup'), { value: 0.75, unit: 'cup' })
  assert.deepEqual(parseQuantityString('¾ cup'), { value: 0.75, unit: 'cup' })
  assert.deepEqual(parseQuantityString('1 1/2 tbsp'), { value: 1.5, unit: 'tbsp' })
})

test('the old regex-only approach is what broke: it stops at the "/"', () => {
  // Reproduces the OLD (pre-fix) parseServing behavior precisely, to pin the
  // failure mode this test guards against.
  const oldParse = (s: string) => {
    const m = s.match(/^~?\s*([\d.]+)\s*(.*)$/)
    if (!m) return { qty: 1, unit: s }
    return { qty: parseFloat(m[1]) || 1, unit: m[2].trim() }
  }
  const broken = oldParse('3/4 cup')
  assert.equal(broken.qty, 3, 'the old parser read "3/4" as qty=3 (should be 0.75)')
  assert.equal(broken.unit, '/4 cup', 'and left the unit unrecognizable to any downstream lookup')
})

test('non-fraction AI servings still parse exactly as before', () => {
  assert.deepEqual(parseQuantityString('1 cup'), { value: 1, unit: 'cup' })
  assert.deepEqual(parseQuantityString('0.75 cup'), { value: 0.75, unit: 'cup' })
  assert.deepEqual(parseQuantityString('150 g'), { value: 150, unit: 'g' })
})

test('SnapPlateModal routes real units through parseQuantityString', () => {
  const src = read('components/nutrition/SnapPlateModal.tsx')
  assert.match(src, /import \{ parseQuantityString, type Unit \} from '@\/lib\/units'/,
    'parseServing must reuse the fraction-aware parser, not a private regex')
  assert.match(src, /const parsed = parseQuantityString\(stripped\)/,
    'parseServing must hand real "qty unit" strings to parseQuantityString')
})
