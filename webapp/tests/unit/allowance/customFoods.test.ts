// Run with: npx tsx --test tests/unit/allowance/customFoods.test.ts
//
// WHO ACTUALLY OWNS A "CUSTOM FOOD".
//
// The free tier allows 3. The count used to be
// `Food.countDocuments({ source: 'manual', createdBy: userId })`, which reads
// like ownership and is not: `importManualFood` hardcodes `source: 'manual'`
// and stamps `createdBy` with whoever called it, and TWO deliberately ungated
// routes go through it —
//
//   • POST /api/nutrition/foods/import with `{ source: 'manual', data }`,
//     which FoodSearchModal uses as its routine fallback whenever a USDA/OFF
//     search hit cannot be re-fetched; and
//   • GET /api/nutrition/foods/barcode, which materialises a live
//     OpenFoodFacts hit so the scanned product has a real id to log against.
//
// Both must stay ungated or free members lose food logging entirely. Counting
// their rows broke the cap in both directions at once: a member at 3/3 could
// mint a fourth food through /foods/import (fail-open bypass), while ordinary
// logging silently consumed all three slots with rows they never knowingly
// created — and since they cannot find those rows, "delete one to free a slot",
// the only escape hatch an inventory cap has, does not apply. It also poisons
// the shadow-mode numbers this epic ships dark to collect.
//
// So authorship is now EXPLICIT: `Food.authoredBy`, stamped only by a gated
// create surface, never read from a request body.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** Every route that mints a Food through importManualFood. */
const IMPORT_CALLERS = [
  'app/api/nutrition/foods/route.ts',
  'app/api/meals/[id]/save-as-food/route.ts',
  'app/api/nutrition/recipes/[id]/save-as-food/route.ts',
  'app/api/nutrition/foods/import/route.ts',
  'app/api/nutrition/foods/barcode/route.ts',
]

/** The subset that is a member deliberately authoring a food. All are gated. */
const AUTHORING = new Set([
  'app/api/nutrition/foods/route.ts',
  'app/api/meals/[id]/save-as-food/route.ts',
  'app/api/nutrition/recipes/[id]/save-as-food/route.ts',
])

// ─── The count ───────────────────────────────────────────────────────────────

test('the custom-foods allowance counts authoredBy, not source+createdBy', () => {
  const src = read('lib/allowances.ts')
  const at = src.indexOf("'custom-foods':")
  assert.ok(at > 0, 'the custom-foods counter must still exist')
  const counter = src.slice(at, at + 200)

  assert.match(counter, /countDocuments\(\{\s*authoredBy:\s*userId\s*\}\)/)
  assert.ok(
    !/source:\s*'manual'/.test(counter),
    "source:'manual' is set by ungated import/barcode materialisation too — it is not ownership",
  )
})

// ─── Who may stamp it ────────────────────────────────────────────────────────

test('only the gated create surfaces claim authorship', () => {
  for (const file of IMPORT_CALLERS) {
    const src = read(file)
    const claims = /authored:\s*true/.test(src)
    assert.equal(
      claims,
      AUTHORING.has(file),
      AUTHORING.has(file)
        ? `${file} is a gated create surface — its rows must count, so pass { authored: true }`
        : `${file} materialises a catalogue hit for LOGGING and is ungated — claiming authorship there ` +
          'is a quota bypass and burns the member\'s slots on rows they never created',
    )
  }
})

test('every surface that claims authorship also passes the quota gate', () => {
  // A create path that stamps authoredBy without requireQuota would write a
  // counted row past the cap; one that gates without stamping would never
  // reach the cap at all.
  for (const file of AUTHORING) {
    const src = read(file)
    assert.match(
      src,
      /requireQuota\((?:request|req),\s*'custom-foods'\)/,
      `${file} stamps authoredBy, so it must charge the custom-foods quota`,
    )
  }
})

test('the authored flag is an argument, never something the client can send', () => {
  const src = read('lib/foodImport.ts')
  // It lives on the options parameter, not on ManualFoodInput — which is
  // exactly `body.data` on /foods/import and `body` on /foods.
  assert.match(src, /interface ManualFoodOptions/)
  assert.match(src, /opts:\s*ManualFoodOptions\s*=\s*\{\}/)
  assert.match(
    src,
    /authoredBy:\s*\n?\s*opts\.authored && createdBy/,
    'authoredBy must be derived from the opts flag plus the server-known caller',
  )

  const inputAt = src.indexOf('export interface ManualFoodInput')
  const inputBlock = src.slice(inputAt, src.indexOf('export interface ManualFoodOptions'))
  assert.ok(
    !/authored/.test(inputBlock),
    'a client-settable authored flag could be omitted on the gated path to mint uncounted foods',
  )
})

test('authorship is stamped only on the branch that really mints a row', () => {
  // importManualFood returns `created: false` from two dedupe branches. If
  // those stamped authoredBy, re-saving a food that already exists — someone
  // else's, even — would claim a slot for a row the member did not create.
  const src = read('lib/foodImport.ts')
  const create = src.indexOf('const food = await Food.create({', src.indexOf('export async function importManualFood'))
  assert.ok(create > 0)
  const stamp = src.indexOf('authoredBy:', create)
  assert.ok(stamp > create, 'authoredBy must be written inside Food.create, after both dedupe returns')
})

// ─── The escape hatch still works ────────────────────────────────────────────

test('an authored food is deletable by its author', () => {
  // An inventory cap is only humane because deleting frees a slot. authoredBy
  // is only ever set alongside createdBy for the same member, which is the
  // field the delete route checks ownership on.
  const src = read('lib/foodImport.ts')
  assert.match(src, /createdBy:\s*createdBy \? new mongoose\.Types\.ObjectId/)
  assert.match(read('app/api/nutrition/foods/[id]/route.ts'), /food\.createdBy\?\.toString\(\) === authResult\.userId/)
})

// ─── The model ───────────────────────────────────────────────────────────────

test('authoredBy is indexed, because the count runs on every gated create', () => {
  const src = read('models/Food.ts')
  assert.match(src, /authoredBy:\s*\{\s*type:\s*Schema\.Types\.ObjectId/)
  assert.match(src, /FoodSchema\.index\(\{\s*authoredBy:\s*1\s*\}/)
})
