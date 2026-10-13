// Run with: npm run test:file tests/unit/parseModelJson.test.ts
//
// Pinned to the real failure: run_1786492759812_jxx2hd, 2026-08-11. The reviewer
// returned a correct verdict and it was thrown away because of the closing
// brace the parser picked.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseModelJson } from '../../lib/nutrition/parseModelJson'

test('trailing junk after a valid object no longer eats the verdict', () => {
  // Verbatim shape from the run: valid JSON, then a stray `"}`.
  const raw =
    '{"verdict":"conflicted","problem":"unclear","confidence":0.6,' +
    '"reasoning":"Sources disagree.","leanedOn":["usda","target.com"]}"}'

  // What the old parser did: lastIndexOf('}') anchors on the junk.
  const naive = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  assert.throws(() => JSON.parse(naive), 'the old slice must still be broken')

  const out = parseModelJson<{ verdict: string; confidence: number }>(raw)
  assert.equal(out.ok, true)
  assert.equal(out.value!.verdict, 'conflicted')
  assert.equal(out.value!.confidence, 0.6)
})

test('a clean reply parses byte-exact', () => {
  const out = parseModelJson<{ a: number[] }>('{"a":[1,2,3]}')
  assert.equal(out.ok, true)
  assert.deepEqual(out.value!.a, [1, 2, 3])
})

test('preamble and code fences', () => {
  assert.equal(parseModelJson<{ v: number }>('```json\n{"v":1}\n```').value!.v, 1)
  assert.equal(parseModelJson<{ v: number }>('Here is what I found:\n{"v":2}').value!.v, 2)
  assert.equal(parseModelJson<{ v: number }>('{"v":3}\n\nHope that helps!').value!.v, 3)
})

test('a brace inside a string is not a closing brace', () => {
  // Naive depth counting would stop early and lose half the object.
  const out = parseModelJson<{ note: string; verdict: string }>(
    '{"note":"the label says {3 tortillas} per serving","verdict":"corrected"}',
  )
  assert.equal(out.ok, true)
  assert.equal(out.value!.verdict, 'corrected')
  assert.match(out.value!.note, /\{3 tortillas\}/)
})

test('an escaped quote does not end the string', () => {
  const out = parseModelJson<{ note: string; ok: boolean }>(
    '{"note":"they said \\"three\\" tortillas","ok":true}',
  )
  assert.equal(out.ok, true)
  assert.equal(out.value!.ok, true)
})

test('nested objects close at the right brace', () => {
  const out = parseModelJson<{ correction: { caloriesPer100: number }; verdict: string }>(
    '{"correction":{"caloriesPer100":139,"proteinPer100":11},"verdict":"corrected"} trailing',
  )
  assert.equal(out.ok, true)
  assert.equal(out.value!.correction.caloriesPer100, 139)
  assert.equal(out.value!.verdict, 'corrected')
})

test('genuinely broken output fails honestly, capped', () => {
  // Truncated mid-object: there is no complete object to recover.
  const truncated = '{"verdict":"corrected","reasoning":"' + 'x'.repeat(900)
  const out = parseModelJson(truncated)
  assert.equal(out.ok, false)
  assert.ok(out.raw!.length <= 500)

  assert.equal(parseModelJson('').ok, false)
  assert.equal(parseModelJson(null).ok, false)
  assert.equal(parseModelJson('no json at all').ok, false)
})

test('an object that is already parsed passes straight through', () => {
  const obj = { verdict: 'confirmed' }
  const out = parseModelJson<typeof obj>(obj)
  assert.equal(out.ok, true)
  assert.equal(out.value, obj)
})
