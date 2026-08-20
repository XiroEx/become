// Run with: npx tsx --test tests/unit/logTagMatch.test.ts
//
// The reported bug: "I ate popcorn and added it to Bed and it logged under a
// Meal that I already had logged for Bed, instead of logging under Bed as
// it's own item." The user had a named Meal (e.g. "Chicken Sandwich") already
// logged under the "Bed" tag; adding popcorn via the generic "+ add food"
// button for Bed silently appended it into that meal's item list instead of
// creating its own entry.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findLogForTag } from '../../lib/nutrition/logTagMatch'

const DEFAULT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack']

test('a named Meal already logged for a tag is never chosen as a merge target', () => {
  const logs = [
    { _id: 'sandwich', tags: ['bed'], mealName: 'Chicken Sandwich' },
  ]
  const found = findLogForTag(logs, 'bed', DEFAULT_TAGS)
  assert.equal(found, undefined, 'popcorn must open its own new log, not merge into the named meal')
})

test('a loose (unnamed) log for the same tag still smart-appends as before', () => {
  const logs = [
    { _id: 'loose', tags: ['bed'] },
  ]
  const found = findLogForTag(logs, 'bed', DEFAULT_TAGS)
  assert.equal(found?._id, 'loose')
})

test('a named Meal for a DIFFERENT tag does not block a loose match on this tag', () => {
  const logs = [
    { _id: 'dinner-meal', tags: ['dinner'], mealName: 'Chili' },
    { _id: 'bed-loose', tags: ['bed'] },
  ]
  const found = findLogForTag(logs, 'bed', DEFAULT_TAGS)
  assert.equal(found?._id, 'bed-loose')
})

test('when only a named Meal exists for the tag, no loose log is fabricated', () => {
  const logs = [
    { _id: 'meal1', tags: ['snack'], mealName: 'Trail Mix' },
    { _id: 'meal2', tags: ['snack'], mealName: 'Protein Bar' },
  ]
  assert.equal(findLogForTag(logs, 'snack', DEFAULT_TAGS), undefined)
})

test('untagged loose logs still default to snack', () => {
  const logs = [{ _id: 'untagged', tags: [] }]
  assert.equal(findLogForTag(logs, 'snack', DEFAULT_TAGS)?._id, 'untagged')
})

test('an untagged NAMED meal does not get treated as the default snack bucket', () => {
  const logs = [{ _id: 'named-untagged', tags: [], mealName: 'Mystery Bowl' }]
  assert.equal(findLogForTag(logs, 'snack', DEFAULT_TAGS), undefined)
})

test('tags are matched case-insensitively', () => {
  const logs = [{ _id: 'loose', tags: ['Bed'] }]
  assert.equal(findLogForTag(logs, 'bed', DEFAULT_TAGS)?._id, 'loose')
})

test('primary-tag disambiguation still applies among loose logs', () => {
  // A log tagged both "snack" and "post-workout" is primarily a snack (a
  // default tag) even though "post-workout" appears first in its tags array.
  const logs = [{ _id: 'multi', tags: ['post-workout', 'snack'] }]
  assert.equal(findLogForTag(logs, 'snack', DEFAULT_TAGS)?._id, 'multi')
  assert.equal(findLogForTag(logs, 'post-workout', DEFAULT_TAGS), undefined)
})
