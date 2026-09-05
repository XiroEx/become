// Run with: npx tsx --test tests/unit/security/foodOwnership.test.ts
//
// THE SHARED FOOD CATALOGUE WAS WRITABLE BY WHOEVER SEARCHED FOR A FOOD FIRST.
//
// `createdBy` was treated as ownership, and `createdBy` is stamped with the
// CALLER every time a USDA or OpenFoodFacts row is materialised — including by
// the food search route's own background import, which passes the searching
// member's id. Search "chicken breast", and the USDA rows land attributed to
// you; you may then PATCH them (the allowlist permits `variants`, so calories
// can be set to 0 on a row the whole app logs against) or DELETE them, which
// runs `clearFoodReferences` and $unsets `foodId` from every other member's
// MealLogs, MealPlans, Meals, Recipes, PlateScans and savedFoods. Nothing
// checked `source`, tier, or whether anyone else referenced the row.
//
// Ownership is now `authoredBy`, OR `createdBy` on a `source: 'manual'` row —
// a row a person entered, not one a catalogue mirror produced. The rest of this
// file is the older half of the same story, and the invariant that constrains
// any answer to it.
//
// THE COUNT AND THE OWNERSHIP CHECK READ DIFFERENT FIELDS.
//
// PATCH /api/nutrition/foods/[id] sanitised non-admin bodies with a DENY-LIST
// and then `$set: body`. `authoredBy` — added later, and the field the free
// custom-foods allowance is counted on — was not on it. Two exploits, both
// proven on production against isolated accounts:
//
//   • `{"authoredBy": null}` on your own food freed a slot instantly (used
//     3 → 2, the next create 201) while the food stayed in the catalog. An
//     unlimited number of custom foods, three keystrokes at a time.
//   • `{"authoredBy": "<another member's id>"}` charged YOUR row to THEM. They
//     could not undo it: PATCH and DELETE both authorised on `createdBy`, so
//     their delete and their edit answered 403. Three calls permanently locked
//     any member out of creating custom foods.
//
// The allowlist (lib/nutrition/foodFields.ts, pinned in bodyAllowlists.test.ts)
// stops new damage. This file is about the second half — the split it exposed:
// the quota counts `authoredBy` while ownership authorised on `createdBy`, so a
// slot could be charged to someone with no way to free it. An inventory cap is
// only humane because deleting frees a slot; a row you are billed for and
// cannot delete is a lockout with no self-service way out, and the rows already
// written that way are still in the database.
//
// THE INVARIANT: whoever the slot is charged to can always delete the row and
// get the slot back.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { foodOwnerIds, isFoodOwner } from '../../../lib/nutrition/foodOwnership'
import { MEMBER_FOOD_INPUT_FIELDS, pickFoodFields } from '../../../lib/nutrition/foodFields'
import { FREE_LIMITS } from '../../../lib/entitlements'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const VICTIM = '65f0000000000000000000aa'
const ATTACKER = '65f0000000000000000000bb'

// ─── The predicate ───────────────────────────────────────────────────────────

test('the creator owns their food', () => {
  assert.equal(
    isFoodOwner({ createdBy: VICTIM, authoredBy: VICTIM, source: 'manual' }, VICTIM),
    true,
  )
})

test('THE LOCKOUT: the member the slot is charged to can always delete the row', () => {
  // The shape three PATCHes left behind: charged to the victim, created by the
  // attacker. Before the fix this row answered 403 to its own payer forever.
  const damaged = { createdBy: ATTACKER, authoredBy: VICTIM, source: 'manual' }

  assert.equal(isFoodOwner(damaged, VICTIM), true, 'the victim must be able to free their slot')
  assert.equal(isFoodOwner(damaged, ATTACKER), true, 'the creator keeps the rights they had')
})

test('a stranger owns nothing', () => {
  const food = { createdBy: ATTACKER, authoredBy: ATTACKER, source: 'manual' }
  assert.equal(isFoodOwner(food, VICTIM), false)
  assert.equal(isFoodOwner(food, '65f0000000000000000000cc'), false)
})

test('an unattributed catalog row is owned by nobody', () => {
  // USDA and OpenFoodFacts imports carry neither id. Ownership must not
  // collapse to "everyone" for them.
  assert.deepEqual(foodOwnerIds({}), [])
  assert.equal(isFoodOwner({}, VICTIM), false)
  assert.equal(isFoodOwner({ createdBy: null, authoredBy: undefined }, VICTIM), false)
  assert.equal(isFoodOwner(null, VICTIM), false)
})

test('a missing caller is never an owner', () => {
  assert.equal(isFoodOwner({ createdBy: VICTIM }, undefined), false)
  assert.equal(isFoodOwner({ createdBy: VICTIM }, ''), false)
})

test('ids compare by value, whatever shape mongoose hands back', () => {
  // A hydrated document gives ObjectIds, .lean() can give strings, and a
  // populated path gives an object with a toString(). All three must match.
  const asObjectId = { toString: () => VICTIM }
  assert.equal(isFoodOwner({ createdBy: asObjectId, source: 'manual' }, VICTIM), true)
  assert.equal(isFoodOwner({ authoredBy: asObjectId }, VICTIM), true)
  assert.deepEqual(
    foodOwnerIds({ createdBy: asObjectId, authoredBy: VICTIM, source: 'manual' }),
    [VICTIM],
  )
})

// ─── THE CATALOGUE IS NOT YOURS BECAUSE YOU SEARCHED FOR IT ──────────────────
//
// `createdBy` alone WAS ownership, and `createdBy` is stamped on every
// catalogue row a member's request materialises — `importFromUSDA` and
// `importFromOpenFoodFacts` both take it, and the food search route hands them
// the SEARCHING member's id from its background import:
//
//     after(() => backgroundImportExternals(paged, authResult.userId, …))
//
// So member A types "chicken breast", the USDA rows land with `createdBy: A`,
// and A now holds PATCH and DELETE on rows the entire app logs against. PATCH
// permits `variants`, so every calorie figure is theirs to set. DELETE runs
// `clearFoodReferences`, which $unsets `foodId` from every OTHER member's
// MealLogs, MealPlans, Meals, Recipes, PlateScans and savedFoods. Every member,
// every tier, no kill-switch in front of it.

const IMPORTER = '65f0000000000000000000dd'

test('THE HIJACK: searching for a food does not make its catalogue row yours', () => {
  // Exactly what backgroundImportExternals writes: provenance, no authorship.
  for (const source of ['usda', 'openfoodfacts']) {
    const catalogueRow = { createdBy: IMPORTER, source }
    assert.equal(
      isFoodOwner(catalogueRow, IMPORTER),
      false,
      `a ${source} row is shared data — the member whose search pulled it in may not rewrite or delete it`,
    )
    assert.deepEqual(foodOwnerIds(catalogueRow), [], 'a mirrored catalogue row is owned by nobody')
  }
})

test('a member still owns the manual row they entered', () => {
  // The two ungated materialisation paths (POST /foods/import with
  // source:'manual', the barcode scanner's live-OFF fallback) write
  // `source: 'manual'` with no authoredBy. Those are still the member's own
  // rows and must stay editable and deletable, or the fix trades one lockout
  // for another.
  assert.equal(isFoodOwner({ createdBy: IMPORTER, source: 'manual' }, IMPORTER), true)
})

test('THE INVARIANT SURVIVES: the charged member can delete any row shape', () => {
  // The slot is charged on authoredBy, so authoredBy grants ownership
  // UNCONDITIONALLY — the manual-source qualifier applies to createdBy alone.
  // In practice authoredBy is only ever stamped by importManualFood, which
  // hardcodes source:'manual', so the qualifier can never strand a payer; the
  // unconditional branch is what guarantees it even on a mangled row.
  const shapes = [
    { authoredBy: VICTIM, createdBy: VICTIM, source: 'manual' },   // healthy
    { authoredBy: VICTIM, createdBy: ATTACKER, source: 'manual' }, // the PATCH damage
    { authoredBy: VICTIM },                                        // no source (partial projection)
    { authoredBy: VICTIM, source: 'usda' },                        // should not exist; still deletable
  ]
  for (const shape of shapes) {
    assert.equal(isFoodOwner(shape, VICTIM), true, JSON.stringify(shape))
  }
})

test('a missing source fails CLOSED for createdBy', () => {
  // `source` is required on the schema, so a document read for a mutation
  // always carries it. A projection that drops it must not silently widen
  // ownership back out over the whole catalogue.
  assert.equal(isFoodOwner({ createdBy: IMPORTER }, IMPORTER), false)
  assert.equal(isFoodOwner({ createdBy: IMPORTER, source: undefined }, IMPORTER), false)
  assert.equal(isFoodOwner({ createdBy: IMPORTER, source: 'Manual' }, IMPORTER), false)
})

// ─── Barcode squatting ───────────────────────────────────────────────────────
//
// `barcode` is unique+sparse and is the FIRST thing
// GET /api/nutrition/foods/barcode resolves — `Food.findOne({ barcode })`,
// ahead of OpenFoodFacts and USDA and with no check on `source`. It was on the
// member PATCH allowlist, and POST /api/nutrition/foods/import accepted
// `{ source: 'manual', data: { barcode } }` verbatim, so a member could stamp a
// real UPC onto a row they controlled and own every scan of that product, for
// every member.

test('a member cannot set a barcode through the food PATCH', () => {
  assert.deepEqual(pickFoodFields({ name: 'Rice', barcode: '0049000000443' }, false), {
    name: 'Rice',
  })
  assert.ok(
    !(MEMBER_FOOD_INPUT_FIELDS as readonly string[]).includes('barcode'),
    'barcode is a claim on a global namespace, not a property of your row',
  )
})

test('a client-supplied barcode is only honoured when the SERVER resolved it', () => {
  const importSrc = read('lib/foodImport.ts')
  assert.match(importSrc, /trustedBarcode\?:\s*boolean/, 'the trust flag lives on the options arg')
  assert.match(
    importSrc,
    /const barcode = opts\.trustedBarcode \? input\.barcode : undefined/,
    'an untrusted barcode must be dropped before BOTH the dedupe lookup and the create',
  )

  // …and never read back off `input` afterwards.
  const fnAt = importSrc.indexOf('export async function importManualFood')
  const body = importSrc.slice(fnAt).replace(/\/\/[^\n]*/g, '')
  const resolveAt = body.indexOf('const barcode =')
  const afterResolve = body.slice(body.indexOf('\n', resolveAt))
  assert.ok(
    !/input\.barcode/.test(afterResolve),
    'input.barcode must not be used again once the trusted value is resolved',
  )

  // The flag is an argument, never a body field — same reason as `authored`.
  const inputAt = importSrc.indexOf('export interface ManualFoodInput')
  const inputBlock = importSrc.slice(inputAt, importSrc.indexOf('export interface ManualFoodOptions'))
  assert.ok(!/trustedBarcode/.test(inputBlock))

  // Only the scanner trusts it outright: it persists the code the live
  // OpenFoodFacts API just answered for. The two body-driven routes hand it the
  // database-confirmed admin check instead.
  assert.match(read('app/api/nutrition/foods/barcode/route.ts'), /trustedBarcode:\s*true/)
  const importRoute = read('app/api/nutrition/foods/import/route.ts')
  assert.match(importRoute, /const trustedBarcode = await isVerifiedAdmin\(authResult\)/)
  assert.match(importRoute, /importManualFood\(data, authResult\.userId, \{ trustedBarcode \}\)/)
  assert.match(read('app/api/nutrition/foods/route.ts'), /trustedBarcode:\s*isAdmin/)
})

// ─── Cross-member manual dedupe ──────────────────────────────────────────────

test('the manual dedupe hands back only rows the caller created or authored', () => {
  // `Food.findOne({ slug: base, source: 'manual' })` was unscoped, so the second
  // member to save a "Protein Shake" silently received the FIRST member's
  // document: `created: false`, so no slot charged and no authoredBy stamped —
  // a food they could not edit or delete, owned by someone who could delete it
  // out from under their meal logs.
  const src = read('lib/foodImport.ts').replace(/\/\/[^\n]*/g, '')
  const fnAt = src.indexOf('export async function importManualFood')
  assert.ok(fnAt > 0)
  const body = src.slice(fnAt)
  assert.doesNotMatch(
    body,
    /findOne\(\{ slug: base, source: 'manual' \}\)/,
    "an unscoped slug dedupe hands one member another member's row",
  )
  assert.match(body, /\$or: \[\{ createdBy: ownerId \}, \{ authoredBy: ownerId \}\]/)
})

test('recipe save-as-food only writes recipeId onto a food the caller owns', () => {
  const src = read('app/api/nutrition/recipes/[id]/save-as-food/route.ts').replace(/\/\/[^\n]*/g, '')
  assert.match(src, /isFoodOwner\(foodDoc, auth\.userId\)/)
  const guardAt = src.indexOf('isFoodOwner(foodDoc, auth.userId)')
  const setAt = src.indexOf('$set: { recipeId: recipe._id }')
  assert.ok(guardAt > 0 && setAt > guardAt, 'the recipeId write must sit inside the ownership guard')
})

// ─── The routes ask the one predicate ────────────────────────────────────────

test('both food mutations authorise through foodOwnership, not on createdBy', () => {
  const src = read('app/api/nutrition/foods/[id]/route.ts')
  const code = src.replace(/\/\/[^\n]*/g, '')

  assert.equal(
    (code.match(/isFoodOwner\(food, authResult\.userId\)/g) ?? []).length,
    2,
    'PATCH and DELETE must both use it',
  )
  assert.doesNotMatch(
    code,
    /food\.createdBy\?\.toString\(\) === authResult\.userId/,
    'a bare createdBy check leaves the charged member unable to free their slot',
  )
})

test('authoredBy is still unwritable from a body, for members and admins alike', () => {
  // Belt and braces with bodyAllowlists.test.ts: the ownership widening above
  // only stays safe while the field cannot be pointed at someone else.
  for (const isAdmin of [false, true]) {
    assert.deepEqual(pickFoodFields({ authoredBy: VICTIM, name: 'Rice' }, isAdmin), { name: 'Rice' })
  }
})

// ─── The general rule, across every counted cap ──────────────────────────────

test('every inventory allowance counts the field its delete authorises on', () => {
  // Foods was the only cap where the two drifted apart, and the drift was
  // invisible until someone could write the counted field. Pinning the pairing
  // for all five means the next cap has to answer the question deliberately.
  const counted: Record<string, { countedOn: string; ownedBy: string }> = {
    'custom-programs': { countedOn: 'createdBy', ownedBy: 'createdBy' },
    'custom-exercises': { countedOn: 'createdBy', ownedBy: 'createdBy' },
    'custom-meals': { countedOn: 'createdBy', ownedBy: 'createdBy' },
    'custom-foods': { countedOn: 'authoredBy', ownedBy: "authoredBy OR (createdBy AND source==='manual')" },
    'custom-sessions': { countedOn: 'the member\'s own workoutLogs', ownedBy: 'the same subdocument' },
  }

  const inventory = (Object.keys(FREE_LIMITS) as (keyof typeof FREE_LIMITS)[])
    .filter((f) => FREE_LIMITS[f].kind === 'inventory' && FREE_LIMITS[f].limit > 0)
    .sort()
  assert.deepEqual(inventory, Object.keys(counted).sort(), 'a new counted cap must be paired here')

  const allowances = read('lib/allowances.ts')
  assert.match(allowances, /'custom-programs':\s*\(userId\)\s*=>\s*\n?\s*ProgramModel\.countDocuments\(\{ isCustom: true, createdBy: userId \}\)/)
  assert.match(allowances, /'custom-exercises':\s*\(userId\)\s*=>\s*\n?\s*Exercise\.countDocuments\(\{ isCustom: true, createdBy: userId \}\)/)
  assert.match(allowances, /'custom-meals':\s*\(userId\)\s*=>\s*Meal\.countDocuments\(\{ createdBy: userId \}\)/)
  assert.match(allowances, /'custom-foods':\s*\(userId\)\s*=>\s*Food\.countDocuments\(\{ authoredBy: userId \}\)/)

  // …and the delete each one is freed by.
  assert.match(read('app/api/programs/custom/[programId]/route.ts'), /createdBy: userId/)
  assert.match(read('app/api/exercises/custom/[slug]/route.ts'), /createdBy: gate\.userId\.toString\(\)/)
  assert.match(read('app/api/meals/[id]/route.ts'), /meal\.createdBy\?\.toString\(\) === authResult\.userId/)
  assert.match(read('app/api/nutrition/foods/[id]/route.ts'), /isFoodOwner\(food, authResult\.userId\)/)
})
