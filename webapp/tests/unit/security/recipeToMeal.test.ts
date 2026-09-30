// Run with: npm run test:file tests/unit/security/recipeToMeal.test.ts
//
// REGRESSION: POST /api/nutrition/recipes/[id]/to-meal DELETED ANOTHER
// MEMBER'S RECIPE.
//
// The route authorised with a READ predicate —
//
//     const isOwner = recipe.createdBy?.toString() === auth.userId
//     if (!isOwner && !recipe.isPublic) return 403
//
// — and then unconditionally ran the destructive half of the documented "meal
// ↔ recipe convert is a MOVE" behaviour: Food.updateMany({recipeId}, $unset),
// Recipe.deleteOne, RecipeImage.deleteOne. Every public recipe therefore passed
// the check, and Recipe.isPublic DEFAULTS TO TRUE (models/Recipe.ts) while
// GET /api/nutrition/recipes lists other members' public recipes, so the
// convert button on /dashboard/recipes/[id] was reachable for recipes the
// caller did not own. Reproduced in production twice on isolated accounts: a
// free account converted a stranger's public recipe, the owner's recipe and
// image were destroyed and their GET 404'd, and the attacker kept the meal.
//
// The fix separates "may I read this" from "may I destroy this". Destruction is
// now conditioned on PROVEN ownership and nothing else.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Types } from 'mongoose'
import { NextRequest } from 'next/server'
import { POST } from '../../../app/api/nutrition/recipes/[id]/to-meal/route'
import { signToken } from '../../../lib/auth'
import {
  recipeConvertMode,
  convertDeletesSource,
} from '../../../lib/nutrition/recipeConvert'

const ROOT = path.join(__dirname, '../../..')
const ROUTE = 'app/api/nutrition/recipes/[id]/to-meal/route.ts'
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ── recipeConvertMode: the whole decision, pure ─────────────────────────────

test('the owner still gets a MOVE — the documented behaviour is unchanged', () => {
  assert.equal(recipeConvertMode({ createdBy: 'u1', isPublic: false }, 'u1'), 'move')
  assert.equal(recipeConvertMode({ createdBy: 'u1', isPublic: true }, 'u1'), 'move')
})

test('THE BUG: a non-owner on a PUBLIC recipe gets a copy, never a move', () => {
  assert.equal(recipeConvertMode({ createdBy: 'owner', isPublic: true }, 'attacker'), 'copy')
})

test('a non-owner on a PRIVATE recipe is still refused', () => {
  assert.equal(recipeConvertMode({ createdBy: 'owner', isPublic: false }, 'attacker'), 'forbidden')
})

test('an ownerless recipe is never a move, whatever its visibility', () => {
  // A legacy row with no createdBy must not be deletable by whoever opens it.
  assert.equal(recipeConvertMode({ isPublic: true }, 'anyone'), 'copy')
  assert.equal(recipeConvertMode({ isPublic: false }, 'anyone'), 'forbidden')
  assert.equal(recipeConvertMode({ createdBy: null, isPublic: true }, 'anyone'), 'copy')
})

test('an anonymous caller can never own anything', () => {
  assert.equal(recipeConvertMode({ createdBy: 'u1', isPublic: true }, ''), 'copy')
  assert.equal(recipeConvertMode({ createdBy: 'u1', isPublic: true }, undefined), 'copy')
  assert.equal(recipeConvertMode({ createdBy: 'u1', isPublic: false }, undefined), 'forbidden')
})

test('a missing recipe is forbidden, not a move', () => {
  assert.equal(recipeConvertMode(null, 'u1'), 'forbidden')
  assert.equal(recipeConvertMode(undefined, 'u1'), 'forbidden')
})

test('ownership normalises ObjectId against the string userId from the JWT', () => {
  const id = new Types.ObjectId()
  assert.equal(recipeConvertMode({ createdBy: id, isPublic: true }, id.toString()), 'move')
  assert.equal(
    recipeConvertMode({ createdBy: id, isPublic: true }, new Types.ObjectId().toString()),
    'copy',
  )
})

test('a truthy-but-not-true isPublic does not grant a copy', () => {
  // isPublic arrives from Mongo as a real boolean; anything else is a bug
  // upstream and must not widen access.
  assert.equal(
    recipeConvertMode({ createdBy: 'owner', isPublic: 1 as unknown as boolean }, 'attacker'),
    'forbidden',
  )
})

// ── convertDeletesSource: only one mode may destroy ─────────────────────────

test('ONLY a move deletes the source', () => {
  assert.equal(convertDeletesSource('move'), true)
  assert.equal(convertDeletesSource('copy'), false)
  assert.equal(convertDeletesSource('forbidden'), false)
})

// ── Route branches reachable without a database ─────────────────────────────

function convertRequest(authHeader?: string): NextRequest {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/nutrition/recipes/x/to-meal', {
    method: 'POST',
    headers,
  })
}

async function authedHeader(): Promise<string> {
  process.env.JWT_SECRET ||= 'unit-test-placeholder'
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/become-unit-test'
  return `Bearer ${await signToken({ userId: 'convert-test-user', email: 'c@example.com' })}`
}

test('to-meal without a token is 401 (no DB touched)', async () => {
  const res = await POST(convertRequest(), { params: Promise.resolve({ id: 'abc' }) })
  assert.equal(res.status, 401)
})

test('to-meal with a non-ObjectId recipe id is 400 (no DB touched)', async () => {
  const res = await POST(convertRequest(await authedHeader()), {
    params: Promise.resolve({ id: 'not-an-object-id' }),
  })
  assert.equal(res.status, 400)
})

// ── Source guards: the shape that keeps this fixed ──────────────────────────

test('the route decides through recipeConvertMode, not a read predicate', () => {
  const src = readSource(ROUTE)
  assert.match(src, /recipeConvertMode\(recipe, auth\.userId\)/)
  assert.match(src, /mode === 'forbidden'/)
  // The exact predicate that caused the incident must never come back.
  assert.doesNotMatch(
    src,
    /!isOwner\s*&&\s*!recipe\.isPublic/,
    'to-meal must not authorise destruction with a read-access check',
  )
})

test('every destructive call sits inside the ownership branch', () => {
  const src = readSource(ROUTE)
  const guard = 'if (convertDeletesSource(mode)) {'
  const start = src.indexOf(guard)
  assert.ok(start !== -1, 'the convertDeletesSource guard is gone')
  const end = src.indexOf('\n    }', start)
  assert.ok(end > start, 'could not find the end of the guarded block')
  const guarded = src.slice(start, end)

  for (const call of [
    'Recipe.deleteOne(',
    'RecipeImage.deleteOne(',
    'Food.updateMany(',
  ]) {
    const total = src.split(call).length - 1
    const inside = guarded.split(call).length - 1
    assert.equal(
      inside,
      total,
      `${call} appears ${total - inside} time(s) OUTSIDE the ownership guard`,
    )
    assert.ok(total > 0, `${call} disappeared — the owner's MOVE must still work`)
  }
})

test('the response reports which mode ran, so the client never guesses', () => {
  assert.match(readSource(ROUTE), /success: true, meal, mode/)
})
