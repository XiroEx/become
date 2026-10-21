// Run with: npm run test:file tests/unit/barcodeScanAddGuard.test.ts
//
// "The barcode is broken" — scanning opens the camera fine, and a hit shows
// the food (name, nutrition, quantity picker) same as any search result. But
// some scans only ever resolve to a PREVIEW: OpenFoodFacts quality-rejected
// the live product, or the import threw. `importExternalIfNeeded` already
// detects this — it hands back the same synthetic id it was given, plus an
// `error` string — and the sibling "save to My Foods" handler aborts on
// exactly that signal. `handleAddFood` (the Add button under the scanned
// row) did not: it built a log entry with `foodId: undefined` and submitted
// it anyway. The scan LOOKED successful — the food appeared, the quantity
// picker worked — but tapping Add silently produced an unlinked snapshot
// entry instead of the real, loggable food the feature promises. That is the
// whole bug: a successful-looking scan that doesn't actually get you
// anywhere.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const src = read('components/nutrition/FoodSearchModal.tsx')

// Isolate handleAddFood's body so the assertions below can't accidentally
// match the sibling save-to-My-Foods handler, which already has its own
// (correct, pre-existing) version of this guard.
function handleAddFoodBody(source: string): string {
  const start = source.indexOf('const handleAddFood = async')
  assert.ok(start >= 0, 'handleAddFood must exist')
  const nextFn = source.indexOf('\n  const ', start + 1)
  return source.slice(start, nextFn >= 0 ? nextFn : start + 4000)
}

const body = handleAddFoodBody(src)

test('handleAddFood reads the error importExternalIfNeeded reports', () => {
  assert.match(
    body,
    /const \{ foodId, variants: importedVariants, error: importError \} = await importExternalIfNeeded\(selectedFood\)/,
    'the error field must be destructured, not silently dropped',
  )
})

test('handleAddFood aborts instead of logging an unlinked entry when the import never resolved to a real food', () => {
  // A preview/failed import hands back the SAME synthetic id it was given
  // (off-/usda-/preview-off-), which is not a Mongo ObjectId string — that is
  // the signal the sibling save handler already keys off of.
  assert.match(
    body,
    /if \(!isObjectIdString\(foodId\)\)\s*\{/,
    'must check the resolved foodId before building a log entry from it',
  )
  // The abort has to happen BEFORE the entry/variant resolution below it —
  // otherwise it is dead code that runs after the (bad) entry was already built.
  const guardAt = body.search(/if \(!isObjectIdString\(foodId\)\)/)
  const entryAt = body.search(/const entry: LoggedFoodEntry = \{/)
  assert.ok(guardAt >= 0 && entryAt >= 0 && guardAt < entryAt,
    'the foodId guard must run before the entry is built, not after')
})

test('the abort tells the member something, rather than failing silently', () => {
  assert.match(
    body,
    /showToast\(importError \? `Could not add this item: \$\{importError\}` : '[^']+'\)/,
    'must surface SOME message — a scan that silently does nothing is the exact bug being fixed',
  )
})
