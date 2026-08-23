// Run with: npx tsx --test tests/unit/moveMealLogItem.test.ts
//
// A logged-food row could edit its amount and macros, but not the meal tag it
// belonged to. The only workaround was delete + re-log. These tests pin both
// halves of the fix: deterministic tag replacement and item-only movement for
// logs containing more than one food.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalizeMealLogTag,
  replaceMealLogTag,
} from '../../lib/nutrition/moveMealLogItem'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('normalizes a member-entered tag to the same shape as tag creation', () => {
  assert.equal(normalizeMealLogTag('  Late Night  '), 'late-night')
})

test('replaces the selected tag and preserves unrelated tags', () => {
  assert.deepEqual(
    replaceMealLogTag(['lunch', 'post-workout'], 'lunch', 'Dinner'),
    ['dinner', 'post-workout'],
  )
})

test('deduplicates when the destination tag is already on the log', () => {
  assert.deepEqual(
    replaceMealLogTag(['snack', 'post-workout'], 'snack', 'post-workout'),
    ['post-workout'],
  )
})

test('turns the rendered snack fallback on an untagged log into a real tag', () => {
  assert.deepEqual(replaceMealLogTag([], 'snack', 'breakfast'), ['breakfast'])
})

test('refuses to guess when the source tag is stale', () => {
  assert.equal(replaceMealLogTag(['breakfast'], 'snack', 'dinner'), null)
})

test('the item PATCH route splits a moved row out of a multi-food log', () => {
  const route = readSource('app/api/meal-logs/[id]/items/[itemId]/route.ts')
  assert.match(route, /tagChanged && nextTags && log\.items\.length > 1/)
  assert.match(route, /MealLog\.create\(\{[\s\S]*items: \[movedItem\],[\s\S]*tags: nextTags/)
  assert.match(route, /log\.items\.splice\(idx, 1\)/)
  assert.match(
    route,
    /MealLog\.deleteOne\(\{ _id: movedLog\._id \}\)\.catch/,
    'a failed source save must clean up the copy instead of leaving a duplicate',
  )
})

test('the edit sheet offers known tags and sends source + destination', () => {
  const modal = readSource('components/nutrition/EditFoodModal.tsx')
  assert.match(modal, />\s*Meal tag\s*</)
  assert.match(modal, /availableTags\?\.defaults/)
  assert.match(modal, /availableTags\?\.userTags/)
  assert.match(modal, /\{ tag: selectedTag, fromTag: normalizedCurrentTag \}/)
})

test('the nutrition and timeline surfaces provide tag context to the edit sheet', () => {
  const nutrition = readSource('app/dashboard/nutrition/page.tsx')
  const timeline = readSource('app/dashboard/timeline/page.tsx')
  for (const source of [nutrition, timeline]) {
    assert.match(source, /currentTag=/)
    assert.match(source, /availableTags=\{tagsResp\}/)
  }
})
