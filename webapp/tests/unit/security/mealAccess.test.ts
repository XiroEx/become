// Run with: npm run test:file tests/unit/security/mealAccess.test.ts
//
// IDOR: ANY AUTHENTICATED MEMBER COULD READ ANY OTHER MEMBER'S PRIVATE MEAL.
//
// `POST /api/meal-plans` accepts `{ mealId }` and snapshots that meal's items
// into the caller's own plan. It did:
//
//     const meal = await Meal.findById(body.mealId).lean()
//     if (!meal) return 404
//     mealName = meal.name
//     resolvedItems = cloneItemsForSnapshot(meal.items)
//
// — and nothing else. No ownership check at all. Any member who had, or
// guessed, another member's meal id got that meal's NAME and its full
// per-item nutrition planted in their own meal plan, readable straight back
// out of `GET /api/meal-plans`. The exploit is one request long.
//
// The rule already existed, spelled out identically in three sibling routes
// (`meals/[id]`, `meals/[id]/log`, `meal-plans/bulk-from-meal`): a meal is
// readable if it is PUBLIC, or VERIFIED, or YOURS, or you are an admin. The
// fourth site was simply missing it, which is what an inline rule repeated
// four times eventually does. `lib/mealAccess.ts` is that rule extracted so
// the next site cannot be written without it.
//
// Two properties the tests below pin:
//   • a refusal is 404, never 403 — the status must not confirm that a meal
//     with that id exists;
//   • admin is confirmed against the User row (isVerifiedAdmin), never read
//     off the token's `role` claim, which survives a demotion for 30 days.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { canReadMeal, isMealOwner } from '../../../lib/mealAccess'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const OWNER = '65f0000000000000000000aa'
const ATTACKER = '65f0000000000000000000bb'

/** A private meal, exactly as `Meal.findById(...).lean()` returns one. */
const privateMeal = {
  createdBy: { toString: () => OWNER },
  isPublic: false,
  isVerified: false,
  name: "Owner's cutting breakfast",
}

// ─── The predicate ───────────────────────────────────────────────────────────

test('THE EXPLOIT: a stranger cannot read another member\'s private meal', () => {
  assert.equal(canReadMeal(privateMeal, ATTACKER, false), false)
})

test('the owner can read their own private meal', () => {
  assert.equal(canReadMeal(privateMeal, OWNER, false), true)
})

test('a confirmed admin can read a private meal', () => {
  assert.equal(canReadMeal(privateMeal, ATTACKER, true), true)
})

test('published and staff-verified meals stay readable by everyone', () => {
  assert.equal(canReadMeal({ ...privateMeal, isPublic: true }, ATTACKER, false), true)
  assert.equal(canReadMeal({ ...privateMeal, isVerified: true }, ATTACKER, false), true)
})

test('an anonymous caller owns nothing', () => {
  assert.equal(isMealOwner(privateMeal, undefined), false)
  assert.equal(isMealOwner(privateMeal, null), false)
  assert.equal(isMealOwner(privateMeal, ''), false)
  assert.equal(canReadMeal(privateMeal, undefined, false), false)
})

test('an ownerless meal is not owned by whoever asks', () => {
  // Rows written by the combine-save bug carry no owner at all. Nobody is
  // their owner; they are reachable only when published or verified.
  const orphan = { createdBy: undefined, isPublic: false, isVerified: false }
  assert.equal(isMealOwner(orphan, ATTACKER), false)
  assert.equal(canReadMeal(orphan, ATTACKER, false), false)
})

test('ownership compares the id, not the object identity', () => {
  // `createdBy` arrives as an ObjectId from a lean query and as a string from
  // a plain object. Both have to work.
  assert.equal(isMealOwner({ createdBy: OWNER }, OWNER), true)
  assert.equal(isMealOwner({ createdBy: { toString: () => OWNER } }, OWNER), true)
})

// ─── Source guards ───────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

test('every meal-plans route that loads a meal by id checks access first', () => {
  const offenders: string[] = []
  for (const file of walk(path.join(ROOT, 'app/api/meal-plans'))) {
    const src = fs.readFileSync(file, 'utf8')
    if (!/Meal\.findById\(/.test(src)) continue
    // Either the shared helper, or the inline mirror the sibling route still
    // carries. What is NOT acceptable is neither.
    const guarded = /canReadMealFor\(/.test(src)
      || /!meal\.isPublic && !meal\.isVerified/.test(src)
    if (!guarded) offenders.push(path.relative(ROOT, file))
  }
  assert.deepEqual(
    offenders,
    [],
    `a meal template is loaded with no access check in: ${offenders.join(', ')}`,
  )
})

test('POST /api/meal-plans checks access BEFORE it snapshots the items', () => {
  const src = readSource('app/api/meal-plans/route.ts')
  const load = src.indexOf('Meal.findById(')
  const check = src.indexOf('canReadMealFor(')
  const snapshot = src.indexOf('cloneItemsForSnapshot(')
  assert.ok(load >= 0, 'the route no longer loads the meal — update this test')
  assert.ok(check > load, 'POST /api/meal-plans lost its meal access check')
  assert.ok(
    check < snapshot,
    'the access check must run before the meal items are copied into the plan',
  )
})

test('a refused meal reads as 404, not 403', () => {
  const src = readSource('app/api/meal-plans/route.ts')
  const refusal = src.slice(src.indexOf('canReadMealFor('))
  assert.match(
    refusal.slice(0, 400),
    /status: 404/,
    'the refusal must not confirm that a meal with that id exists',
  )
  assert.doesNotMatch(refusal.slice(0, 400), /status: 403/)
})

test('the shared rule confirms admin against the database, not the token claim', () => {
  const src = readSource('lib/mealAccess.ts')
  assert.match(src, /isVerifiedAdmin\(/)
  assert.doesNotMatch(
    src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''),
    /role\s*===\s*['"]admin['"]/,
    'admin must never be decided from a JWT role claim',
  )
})
