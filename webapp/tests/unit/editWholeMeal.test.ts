// Run with: npm run test:file tests/unit/editWholeMeal.test.ts
//
// A logged meal (MealLog with >1 item, e.g. a saved "Coffee & Whey") had no
// way to edit itself as a unit. The only edit affordance lived on individual
// food rows, and retagging one row deliberately splits it out of the meal
// (see moveMealLogItem.test.ts) — so a member who just wanted to move the
// whole meal to a different section ended up splitting a food out of it
// instead, leaving the meal's name attached to whatever items happened to
// remain. These tests pin the fix: a meal-level edit control that PATCHes
// the whole MealLog document (tag + time) in one write, with no split.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { PATCH } from '../../app/api/meal-logs/[id]/route'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  headers.set('Content-Type', 'application/json')
  return new NextRequest('http://localhost/api/meal-logs/log1', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

test('PATCH /api/meal-logs/[id]: no auth header → 401 (no DB touched)', async () => {
  const res = await PATCH(makeRequest({ tag: 'breakfast' }), {
    params: Promise.resolve({ id: 'log1' }),
  })
  assert.equal(res.status, 401)
})

test('the whole-log route moves every item together and never splits', () => {
  const route = readSource('app/api/meal-logs/[id]/route.ts')
  // Reuses the same deterministic tag-replace helper as the per-item route.
  assert.match(route, /normalizeMealLogTag, replaceMealLogTag \} from '@\/lib\/nutrition\/moveMealLogItem'/)
  assert.match(route, /replaceMealLogTag\(log\.tags, body\.fromTag, targetTag\)/)
  assert.match(route, /log\.tags = nextTags/)
  // The defining difference from the item route: no new MealLog is ever
  // created here, so a retag can't sever items from the log they belong to.
  assert.doesNotMatch(route, /MealLog\.create/)
  // A stale client (someone else already moved this meal) must not silently
  // guess a destination — same conflict contract as the per-item route.
  assert.match(route, /status: 409/)
  // untimed is validated and persisted, matching the item route's contract.
  assert.match(route, /typeof body\.untimed !== 'boolean'/)
  assert.match(route, /log\.untimed = body\.untimed/)
})

test('the meal editor sends tag + time changes to the whole-log route, not the item route', () => {
  const modal = readSource('components/nutrition/EditMealModal.tsx')
  assert.match(modal, /fetch\(`\/api\/meal-logs\/\$\{logId\}`/)
  assert.doesNotMatch(modal, /\/items\//)
  assert.match(modal, /\{ tag: selectedTag, fromTag: normalizedCurrentTag \}/)
  assert.match(modal, /mealLogTimePatch\(loggedAt, logTime\)/)
  // Save is disabled with nothing changed, so a no-op edit never PATCHes.
  assert.match(modal, /disabled=\{saving \|\| !hasChanges\}/)
})

test('a logged meal group offers its own edit control, separate from per-item edit', () => {
  const tagSection = readSource('components/nutrition/TagSection.tsx')
  assert.match(tagSection, /onEditMeal\?:/)
  assert.match(tagSection, /onEditMeal\(first\.logId, group\.mealName, tag, first\.loggedAt, first\.untimed\)/)
})

test('the nutrition page wires the meal editor with its own state, distinct from editEntry', () => {
  const page = readSource('app/dashboard/nutrition/page.tsx')
  assert.match(page, /import EditMealModal from '@\/components\/nutrition\/EditMealModal'/)
  assert.match(page, /const \[editMeal, setEditMeal\] = useState</)
  assert.match(page, /onEditMeal=\{\(logId, mealName, currentTag, loggedAt, untimed\) => \{/)
  assert.match(page, /<EditMealModal/)
  assert.match(page, /editMeal !== null/)
})
