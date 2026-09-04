// Run with: npx tsx --test tests/unit/security/mealAttribution.test.ts
//
// THE COMBINE ATTRIBUTION BUG.
//
// POST /api/meal-logs/combine saved its reusable meal as
//
//     Meal.create({ user: auth.userId, name, items, totalNutrition })
//
// `user` is MealLog's owner field. Meal's is `createdBy`. Mongoose strict mode
// dropped the key without a word, so every meal saved through combine was
// written with NO owner:
//
//   • uncounted by the free 3-meal allowance (Meal.countDocuments({ createdBy })
//     never matched) — five combine-saves from a 0/3 baseline all returned 201
//     with `used` still 0;
//   • invisible in GET /api/meals?mine=true and undeletable by its creator,
//     because both filter on createdBy. Clearing the rows took database access.
//
// Three things are pinned here, because the fix is only complete if all three
// hold: the route names the right field, no create path can lose a field
// silently again (lib/strictCreate.ts, derived from the schema so it cannot go
// stale), and the repair script that recovers the rows already on disk cannot
// write by default or guess an owner.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Meal from '@/models/Meal'
import MealLog from '@/models/MealLog'
import Food from '@/models/Food'
import ProgramModel from '@/models/Program'
import {
  unknownSchemaPaths,
  assertKnownSchemaPaths,
  createStrict,
  UnknownSchemaPathError,
} from '@/lib/strictCreate'
import {
  CUSTOM_PROGRAM_INPUT_FIELDS,
  ADMIN_PROGRAM_INPUT_FIELDS,
} from '@/lib/programFields'
import {
  MEMBER_FOOD_INPUT_FIELDS,
  ADMIN_ONLY_FOOD_INPUT_FIELDS,
} from '@/lib/nutrition/foodFields'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ─── The exact defect ────────────────────────────────────────────────────────

test('`user` is not a path on Meal — the write the combine route used to make', () => {
  assert.deepEqual(unknownSchemaPaths(Meal, { user: 'abc' }), ['user'])
  // …and it IS one on MealLog, which is why the mistake read as correct.
  assert.deepEqual(unknownSchemaPaths(MealLog, { user: 'abc' }), [])
  // The field it should have been.
  assert.deepEqual(unknownSchemaPaths(Meal, { createdBy: 'abc' }), [])
})

test('the combine route attributes the meal with createdBy, not user', () => {
  const src = read('app/api/meal-logs/combine/route.ts')
  const create = src.slice(src.indexOf('if (saveAsMeal) {', src.indexOf('let meal')))
  const body = create.slice(0, create.indexOf('})'))
  assert.match(body, /createdBy: auth\.userId/)
  assert.doesNotMatch(body, /\buser: auth\.userId/)
  // And it goes through the guard, so a future rename cannot re-open this.
  assert.match(body, /createStrict/)
})

test('a meal saved by combine is countable by the custom-meals allowance', () => {
  // The allowance counts createdBy; the route now writes createdBy. Pinning
  // both halves together is the point — they drifted apart once already.
  assert.match(
    read('lib/allowances.ts'),
    /'custom-meals':\s*\(userId\)\s*=>\s*Meal\.countDocuments\(\{ createdBy: userId \}\)/,
  )
  assert.match(read('app/api/meal-logs/combine/route.ts'), /createdBy: auth\.userId/)
  // …and the same field is what makes it visible and deletable.
  assert.match(read('app/api/meals/route.ts'), /filter = \{ createdBy: authResult\.userId \}/)
})

// ─── The guard ───────────────────────────────────────────────────────────────

test('createStrict throws rather than writing a document that loses a field', async () => {
  let created = 0
  const fake = {
    modelName: 'Meal',
    schema: { pathType: (p: string) => (p === 'name' ? 'real' : 'adhocOrUndefined') },
    async create(doc: unknown) { created += 1; return doc },
  }

  await assert.rejects(
    () => createStrict(fake, { name: 'x', user: 'abc' }),
    (err: unknown) => {
      assert.ok(err instanceof UnknownSchemaPathError)
      assert.deepEqual((err as UnknownSchemaPathError).paths, ['user'])
      assert.match((err as Error).message, /Meal/)
      return true
    },
  )
  assert.equal(created, 0, 'nothing may be written once a field would be lost')

  assert.deepEqual(await createStrict(fake, { name: 'x' }), { name: 'x' })
  assert.equal(created, 1)
})

test('the guard reads the schema, so it cannot go stale as fields are added', () => {
  // Every real Meal path passes without being listed anywhere in strictCreate.
  const paths = Object.keys(Meal.schema.paths)
  assert.ok(paths.length > 5)
  const doc = Object.fromEntries(paths.map((p) => [p, 1]))
  assert.deepEqual(unknownSchemaPaths(Meal, doc), [])
  // Virtuals and nested paths are not "unknown" either.
  assert.deepEqual(unknownSchemaPaths(Meal, { 'recipe.servings': 2 }), [])
})

test('a strict:false schema opts out — there is nothing silent to catch there', () => {
  const loose = {
    modelName: 'Loose',
    schema: { pathType: () => 'adhocOrUndefined', options: { strict: false as const } },
  }
  assert.deepEqual(unknownSchemaPaths(loose, { anything: 1 }), [])
  assert.doesNotThrow(() => assertKnownSchemaPaths(loose, { anything: 1 }))
})

// ─── Every meal/food/program create goes through it ──────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

const rel = (full: string) => path.relative(ROOT, full).split(path.sep).join('/')

/** Comments describe the defect on purpose (this file does it too). Only CODE
 *  is scanned, or every explanation of the bug would read as the bug. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every file that mints one of these three models, and how many it mints. */
const EXPECTED_CREATES: Record<string, number> = {
  'app/api/meal-logs/combine/route.ts': 1,
  'app/api/meals/route.ts': 1,
  'app/api/nutrition/recipes/[id]/to-meal/route.ts': 1,
  'app/api/programs/route.ts': 1,
  'app/api/programs/custom/route.ts': 1,
  'app/api/admin/foods/[id]/split/route.ts': 1,
  'app/api/admin/e2e-foods-fixture/route.ts': 1,
  'lib/foodImport.ts': 3,
}

test('no meal, food or program anywhere is minted with a raw Model.create', () => {
  // Scanned, not listed: a new create in a new file is caught the day it lands,
  // which is the only version of this guard that keeps working.
  const raw: string[] = []
  const guarded: Record<string, number> = {}

  for (const file of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))]) {
    const name = rel(file)
    const src = stripComments(fs.readFileSync(file, 'utf8'))
    if (/\b(Meal|Food|ProgramModel)\.create\(/.test(src)) raw.push(name)
    const hits = src.match(/createStrict(?:<[^>]*>)?\((?:Meal|Food|ProgramModel),/g)
    if (hits) guarded[name] = hits.length
  }

  assert.deepEqual(
    raw,
    [],
    `raw Model.create on a meal/food/program — a dropped field there is silent:\n  ${raw.join('\n  ')}`,
  )
  assert.deepEqual(guarded, EXPECTED_CREATES)
})

test('every field the body allowlists admit is a real schema path', () => {
  // The other half of the same failure: an allowlist may only name fields that
  // exist, or a caller's value is accepted, copied, and then dropped.
  const asDoc = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, 1]))
  assert.deepEqual(unknownSchemaPaths(ProgramModel, asDoc(CUSTOM_PROGRAM_INPUT_FIELDS)), [])
  assert.deepEqual(unknownSchemaPaths(ProgramModel, asDoc(ADMIN_PROGRAM_INPUT_FIELDS)), [])
  assert.deepEqual(unknownSchemaPaths(Food, asDoc(MEMBER_FOOD_INPUT_FIELDS)), [])
  assert.deepEqual(unknownSchemaPaths(Food, asDoc(ADMIN_ONLY_FOOD_INPUT_FIELDS)), [])
})

// ─── The repair script for the rows already written ──────────────────────────

const REPAIR = read('scripts/repair-orphan-meals.mjs')

test('the repair script is dry-run by default and writes only behind --apply', () => {
  assert.match(REPAIR, /const APPLY = process\.argv\.includes\('--apply'\)/)
  assert.equal((REPAIR.match(/bulkWrite\(/g) ?? []).length, 1)
  const beforeApply = REPAIR.slice(0, REPAIR.indexOf('if (APPLY && repairable.length > 0)'))
  assert.doesNotMatch(beforeApply, /bulkWrite\(|updateOne\(\{|updateMany\(|deleteMany\(/)
})

test('ownership is recovered from the meal log, and only when it is unambiguous', () => {
  // The combine request that created the meal also created the MealLog that
  // points at it, with `user` set — that log is the witness.
  assert.match(REPAIR, /distinct\('user', \{ mealId: meal\._id \}\)/)
  // Exactly one distinct member, or it is left alone. A guess would hand one
  // member's meal to another AND charge them an allowance slot for it.
  assert.match(REPAIR, /if \(distinct\.length === 1\)/)
  assert.match(REPAIR, /unrecoverable\.push/)
})

test('the repair never touches an owned meal or a catalog row', () => {
  const selector = REPAIR.slice(REPAIR.indexOf('const NO_OWNER'), REPAIR.indexOf('await mongoose.connect'))
  assert.match(selector, /createdBy: \{ \$exists: false \}/)
  assert.match(selector, /createdBy: null/)
  assert.match(selector, /isPublic: \{ \$ne: true \}/)
  assert.match(selector, /isVerified: \{ \$ne: true \}/)
  // Idempotent by construction: the write re-asserts ownerlessness, so a row
  // fixed in between is skipped rather than overwritten.
  assert.match(REPAIR, /filter: \{ _id: p\._id, \$or: NO_OWNER \}/)
  assert.match(REPAIR, /IDEMPOTENT/)
})

test('no connection string is baked into the repair script', () => {
  assert.doesNotMatch(REPAIR, /mongodb\+srv:\/\//)
  assert.doesNotMatch(REPAIR, /mongodb:\/\/[^'"\s]*@/)
  assert.match(REPAIR, /process\.env\.MONGODB_URI/)
})
