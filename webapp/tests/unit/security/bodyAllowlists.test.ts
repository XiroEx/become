// Run with: npx tsx --test tests/unit/security/bodyAllowlists.test.ts
//
// REGRESSION: a free `role: 'user'` account shared a program with a stranger.
//
// POST /api/programs/custom did:
//
//     const created = await ProgramModel.create({
//       ...dehydrated, isCustom: true, createdBy: gate.userId,
//     })
//
// `dehydrated` IS the request body (dehydrateProgram mutates and returns its
// input), so every key the client sent reached the model. Program later gained
// `sharedWith` — the grant that puts a program into another member's "My
// Programs" list, written only by POST /api/programs/[programId]/share behind
// requireTrainerOrAdmin — and the create path was never updated. Sending
// `sharedWith: ["<victim id>"]` in the create body persisted it verbatim.
// Reproduced in production on isolated accounts.
//
// The class of bug is "a deny-list that was not updated when a privileged field
// was added", so the fix is an ALLOWLIST and these tests pin it: a new
// privileged Program field is unreachable from a request body until someone
// deliberately adds it, and adding it fails this file.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CUSTOM_PROGRAM_INPUT_FIELDS,
  pickCustomProgramFields,
  rejectedProgramFields,
} from '../../../lib/programFields'
import {
  RECIPE_INPUT_FIELDS,
  pickRecipeFields,
  rejectedRecipeFields,
} from '../../../lib/nutrition/recipeFields'
import {
  ADMIN_ONLY_FOOD_INPUT_FIELDS,
  MEMBER_FOOD_INPUT_FIELDS,
  pickFoodFields,
  rejectedFoodFields,
} from '../../../lib/nutrition/foodFields'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ── The program allowlist ───────────────────────────────────────────────────

test('the program allowlist is exactly the nine member-authored fields', () => {
  // Pinned as a literal so WIDENING it is a deliberate, reviewed edit rather
  // than a side effect of adding a field to the model.
  assert.deepEqual([...CUSTOM_PROGRAM_INPUT_FIELDS], [
    'name',
    'description',
    'duration_weeks',
    'training_days_per_week',
    'goal',
    'target_user',
    'equipment',
    'tags',
    'phases',
  ])
})

test('THE BUG: a client-supplied sharedWith never survives the picker', () => {
  const picked = pickCustomProgramFields({
    name: 'My Program',
    phases: [],
    sharedWith: ['64b0000000000000000000aa'],
  })
  assert.equal('sharedWith' in picked, false)
  assert.deepEqual(Object.keys(picked).sort(), ['name', 'phases'])
})

test('every privileged Program field is rejected, not just sharedWith', () => {
  const hostile = {
    name: 'ok',
    sharedWith: ['victim'],
    createdBy: 'someone-else',
    isCustom: false,
    program_id: 'jon-don-signature-program',
    coverImage: 'https://example.com/x.png',
    coverParallax: true,
    coverZoom: 3,
    coverPositionX: 0,
    coverPositionY: 0,
    _id: '64b0000000000000000000aa',
    __v: 7,
    createdAt: '1999-01-01',
    updatedAt: '1999-01-01',
  }
  assert.deepEqual(Object.keys(pickCustomProgramFields(hostile)), ['name'])
  assert.deepEqual(
    rejectedProgramFields(hostile).sort(),
    Object.keys(hostile).filter((k) => k !== 'name').sort(),
  )
})

test('the legitimate program payload passes through untouched', () => {
  const body = {
    name: 'Push Pull Legs',
    description: 'six days',
    duration_weeks: 8,
    training_days_per_week: 6,
    goal: 'hypertrophy',
    target_user: 'Intermediate',
    equipment: ['barbell'],
    tags: ['ppl'],
    phases: [{ phase: 'A', weeks: '1-4', focus: 'volume', workouts: [] }],
  }
  assert.deepEqual(pickCustomProgramFields(body), body)
  assert.deepEqual(rejectedProgramFields(body), [])
})

test('the picker drops undefined so it cannot blank a field it never received', () => {
  const picked = pickCustomProgramFields({ name: 'x', description: undefined })
  assert.equal('description' in picked, false)
})

test('the picker is safe on junk input', () => {
  assert.deepEqual(pickCustomProgramFields(null), {})
  assert.deepEqual(pickCustomProgramFields(undefined), {})
  assert.deepEqual(rejectedProgramFields(null), [])
})

// ── Both program routes use the ONE list ────────────────────────────────────

test('create and update share a single allowlist', () => {
  const create = readSource('app/api/programs/custom/route.ts')
  const update = readSource('app/api/programs/custom/[programId]/route.ts')

  assert.match(create, /pickCustomProgramFields\(dehydrated\)/)
  assert.match(update, /CUSTOM_PROGRAM_INPUT_FIELDS/)
  // The sibling must not carry its own drifting copy of the list.
  assert.doesNotMatch(update, /const allowedKeys = \[/)
})

test('the create route no longer spreads the request body into the model', () => {
  const create = readSource('app/api/programs/custom/route.ts')
  const code = create.replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(code, /\.\.\.dehydrated\b/, 'the whole body reaches ProgramModel.create again')
  assert.doesNotMatch(code, /\.\.\.body\b/)
  // …and still pins ownership after the allowlist.
  assert.match(create, /isCustom: true/)
  assert.match(create, /createdBy: gate\.userId/)
})

test('program_id stays server-minted from a normalised seed', () => {
  const create = readSource('app/api/programs/custom/route.ts')
  assert.match(create, /program_id: programId/)
  assert.match(create, /custom-\$\{userSuffix\}-\$\{seed\}/)
})

// ── The same class, found while auditing: recipes ───────────────────────────

test('the recipe allowlist keeps ownership and ranking fields server-owned', () => {
  const hostile = {
    name: 'Soup',
    category: 'Other',
    ingredients: [],
    createdBy: 'someone-else',
    usageCount: 999999,
    savedFoodId: '64b0000000000000000000aa',
    _id: '64b0000000000000000000bb',
    createdAt: '1999-01-01',
  }
  const picked = pickRecipeFields(hostile)
  assert.deepEqual(Object.keys(picked).sort(), ['category', 'ingredients', 'name'])
  assert.deepEqual(rejectedRecipeFields(hostile).sort(), [
    '_id',
    'createdAt',
    'createdBy',
    'savedFoodId',
    'usageCount',
  ])
})

test('everything RecipeForm actually submits is still accepted', () => {
  // components/nutrition/RecipeForm.tsx — the real client payload.
  const formKeys = [
    'name',
    'category',
    'description',
    'servings',
    'prepTime',
    'cookTime',
    'instructions',
    'tags',
    'ingredients',
  ]
  for (const key of formKeys) {
    assert.ok(
      (RECIPE_INPUT_FIELDS as readonly string[]).includes(key),
      `RecipeForm sends ${key} and the allowlist would silently drop it`,
    )
  }
})

test('the recipe routes no longer take the body wholesale', () => {
  const create = readSource('app/api/nutrition/recipes/route.ts').replace(/\/\/[^\n]*/g, '')
  const update = readSource('app/api/nutrition/recipes/[id]/route.ts').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(create, /\.\.\.body\b/)
  assert.match(create, /pickRecipeFields\(body\)/)
  assert.doesNotMatch(update, /Object\.assign\(recipe, body\)/)
  assert.match(update, /Object\.assign\(recipe, pickRecipeFields\(body\)\)/)
})

// ── The same class again: PATCH /api/nutrition/foods/[id] ──────────────────
//
// That route used a DENY-list, and the deny-list never learned about
// `authoredBy` — the field the free custom-foods allowance is COUNTED on
// (lib/allowances.ts). An owner could clear it off their own row and free a
// slot, as many times as they liked.

test('THE BUG: authoredBy is not writable by anyone through the food PATCH', () => {
  for (const isAdmin of [false, true]) {
    const picked = pickFoodFields({ name: 'Rice', authoredBy: null }, isAdmin)
    assert.equal('authoredBy' in picked, false, `authoredBy leaked for isAdmin=${isAdmin}`)
    assert.deepEqual(picked, { name: 'Rice' })
  }
})

test('the fields the old deny-list forgot are refused for everyone', () => {
  const hostile = {
    name: 'Rice',
    authoredBy: null,
    recipeId: '64b0000000000000000000aa',
    verification: { state: 'verified' },
    reviewFlag: { owner: 'manual' },
    needsReview: false,
    hiddenFromSearch: false,
    groupKey: 'x',
    _id: '64b0000000000000000000bb',
  }
  for (const isAdmin of [false, true]) {
    assert.deepEqual(Object.keys(pickFoodFields(hostile, isAdmin)), ['name'])
  }
})

test('a member still cannot self-verify or self-promote a food', () => {
  const body = { name: 'Rice', isVerified: true, isFirstClass: true, usageCount: 9e9, slug: 'x' }
  assert.deepEqual(Object.keys(pickFoodFields(body, false)), ['name'])
  assert.deepEqual(rejectedFoodFields(body, false).sort(), [
    'isFirstClass',
    'isVerified',
    'slug',
    'usageCount',
  ])
})

test('admins keep EXACTLY the fields the deny-list gave them, and no more', () => {
  // Parity assertion: the admin extras are the eight the deny-list named.
  assert.deepEqual([...ADMIN_ONLY_FOOD_INPUT_FIELDS], [
    'isVerified',
    'isFirstClass',
    'usageCount',
    'createdBy',
    'source',
    'externalId',
    'externalDataType',
    'slug',
  ])
  const body = Object.fromEntries(ADMIN_ONLY_FOOD_INPUT_FIELDS.map((k) => [k, 'v']))
  assert.deepEqual(Object.keys(pickFoodFields(body, true)).sort(), [...ADMIN_ONLY_FOOD_INPUT_FIELDS].sort())
})

test('the member-editable set still covers what the food page actually sends', () => {
  // app/dashboard/foods/[id]/page.tsx PATCHes { variants }.
  assert.ok((MEMBER_FOOD_INPUT_FIELDS as readonly string[]).includes('variants'))
  assert.deepEqual(pickFoodFields({ variants: [{ name: 'serving' }] }, false), {
    variants: [{ name: 'serving' }],
  })
})

test('the food PATCH route no longer $sets the raw body', () => {
  const src = readSource('app/api/nutrition/foods/[id]/route.ts').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(src, /\$set: body/)
  assert.match(src, /pickFoodFields\(body, isAdmin\)/)
  // The deny-list must not come back alongside it.
  assert.doesNotMatch(src, /delete body\./)
})

// ── The net: no create/update route spreads an unvalidated body ─────────────

test('no member-facing route spreads a request body into a model write', () => {
  // `...body` / `Object.assign(doc, body)` next to a model call is exactly how
  // sharedWith leaked. app/api/exercises is exempt: it is requireAdmin-gated
  // (database-checked) end to end, so there is no privilege to escalate.
  const EXEMPT = new Set(['app/api/exercises/route.ts'])
  const offenders: string[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.name.endsWith('.ts')) continue
      const rel = path.relative(ROOT, full)
      if (EXEMPT.has(rel)) continue
      const code = fs
        .readFileSync(full, 'utf8')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      if (
        /\.\.\.body\b/.test(code) ||
        /Object\.assign\([A-Za-z_$][\w$]*,\s*body\)/.test(code) ||
        /\$set:\s*body\b/.test(code)
      ) {
        offenders.push(rel)
      }
    }
  }
  walk(path.join(ROOT, 'app/api'))

  assert.deepEqual(offenders, [], `unvalidated body spread in: ${offenders.join(', ')}`)
})
