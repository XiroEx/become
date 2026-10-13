// Run with: npm run test:file tests/unit/security/recipePrivateDefault.test.ts
//
// REGRESSION: recipes created in the native app were PUBLIC.
//
// The native app never sent `isPublic` when creating a recipe, and the Recipe
// schema defaulted it to `true`, so every native recipe appeared in other
// members' recipe lists (GET /api/nutrition/recipes returns `isPublic: true`
// OR your own). The web form never sent it either. Found in the 2026-10-13
// App Store privacy audit.
//
// The fix: the schema default is `false`, the create route only publishes on
// an explicit boolean `true`, and both clients send `isPublic: false` on
// create. Edits leave the stored value alone.
//
// The route is driven for real: Recipe.create is replaced with a recorder and
// `global.mongoose` is pre-seeded so dbConnect() never opens a socket (the
// pattern in workouts-slot-credit.test.ts).

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import Recipe from '../../../models/Recipe'
import { signToken } from '../../../lib/auth'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const BASE_BODY = {
  name: 'Turkey Chili',
  category: 'Other',
  servings: 2,
  ingredients: [{ name: 'Turkey', amount: 1, unit: 'serving', nutrition: { calories: 150, protein: 25, carbs: 0, fats: 5 } }],
}

async function createWith(extra: Record<string, unknown>): Promise<Record<string, unknown>> {
  const g = globalThis as unknown as { mongoose?: { conn: unknown; promise: unknown } }
  g.mongoose = { conn: {}, promise: null }

  let written: Record<string, unknown> | null = null
  const create = mock.method(Recipe, 'create', async (doc: Record<string, unknown>) => {
    written = doc
    return { _id: 'r1', ...doc }
  })
  try {
    const { POST } = await import('../../../app/api/nutrition/recipes/route')
    const token = await signToken({ userId: '64b000000000000000000001', email: 'r@example.com' })
    const res = await POST(new NextRequest('http://localhost/api/nutrition/recipes', {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
      body: JSON.stringify({ ...BASE_BODY, ...extra }),
    }))
    assert.equal(res.status, 201)
  } finally {
    create.mock.restore()
  }
  assert.ok(written, 'Recipe.create was not called')
  return written
}

test('the Recipe schema defaults to private', () => {
  const doc = new Recipe({ name: 'x', category: 'Other', ingredients: [] })
  assert.equal(doc.isPublic, false)
})

test('THE BUG: a create that omits isPublic (the native app) is private', async () => {
  const written = await createWith({})
  assert.equal(written.isPublic, false)
})

test('only a real boolean true publishes', async () => {
  assert.equal((await createWith({ isPublic: false })).isPublic, false)
  assert.equal((await createWith({ isPublic: 'true' })).isPublic, false)
  assert.equal((await createWith({ isPublic: null })).isPublic, false)
  assert.equal((await createWith({ isPublic: true })).isPublic, true)
})

test('the web form sends isPublic: false on create, and nothing on edit', () => {
  const src = readSource('components/nutrition/RecipeForm.tsx')
  assert.match(src, /isEdit \? payload : \{ \.\.\.payload, isPublic: false \}/)
})
