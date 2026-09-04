// Run with: npx tsx --test tests/unit/security/foodOwnership.test.ts
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
import { pickFoodFields } from '../../../lib/nutrition/foodFields'
import { FREE_LIMITS } from '../../../lib/entitlements'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const VICTIM = '65f0000000000000000000aa'
const ATTACKER = '65f0000000000000000000bb'

// ─── The predicate ───────────────────────────────────────────────────────────

test('the creator owns their food', () => {
  assert.equal(isFoodOwner({ createdBy: VICTIM, authoredBy: VICTIM }, VICTIM), true)
})

test('THE LOCKOUT: the member the slot is charged to can always delete the row', () => {
  // The shape three PATCHes left behind: charged to the victim, created by the
  // attacker. Before the fix this row answered 403 to its own payer forever.
  const damaged = { createdBy: ATTACKER, authoredBy: VICTIM }

  assert.equal(isFoodOwner(damaged, VICTIM), true, 'the victim must be able to free their slot')
  assert.equal(isFoodOwner(damaged, ATTACKER), true, 'the creator keeps the rights they had')
})

test('a stranger owns nothing', () => {
  const food = { createdBy: ATTACKER, authoredBy: ATTACKER }
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
  assert.equal(isFoodOwner({ createdBy: asObjectId }, VICTIM), true)
  assert.equal(isFoodOwner({ authoredBy: asObjectId }, VICTIM), true)
  assert.deepEqual(foodOwnerIds({ createdBy: asObjectId, authoredBy: VICTIM }), [VICTIM])
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
    'custom-foods': { countedOn: 'authoredBy', ownedBy: 'createdBy OR authoredBy' },
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
