// Run with: npm run test:file tests/unit/exerciseAutoCatalog.test.ts
//
// Card: "Some program exercises don't exist in our data base or are not in
// our admin portal which means we can't upload videos or edit them."
//
// These pin the shape of the row a program save mints for a name the catalog
// has never heard of: a real catalog exercise (not somebody's custom), active,
// classified as far as the name allows, and carrying NO video — which is what
// lists it in the admin portal's "No Video" tab for Jon to record.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTO_CATALOG_TAG, autoCatalogSlug, buildAutoCatalogExercise } from '../../lib/exerciseAutoCatalog'

test('the slug is the same rule the admin create form uses', () => {
  assert.equal(autoCatalogSlug('Sled Push'), 'sled-push')
  assert.equal(autoCatalogSlug("Finisher: KB Farmer's Carry"), 'finisher-kb-farmer-s-carry')
  assert.equal(autoCatalogSlug('Incline DB Press (15-30°)'), 'incline-db-press-15-30')
  assert.equal(autoCatalogSlug('  Up-downs  '), 'up-downs')
})

test('a name with nothing sluggable in it yields no slug', () => {
  assert.equal(autoCatalogSlug('!!!'), '')
})

test('a minted row is a catalog exercise, visible and editable', () => {
  const row = buildAutoCatalogExercise('Sled Push', 'sled-push')
  assert.equal(row.slug, 'sled-push')
  assert.equal(row.name, 'Sled Push')
  assert.equal(row.isCustom, false)   // not owner-private: the program is everyone's
  assert.equal(row.isActive, true)
})

test('a minted row carries no video — that is the flag', () => {
  const row = buildAutoCatalogExercise('Sled Push', 'sled-push') as Record<string, unknown>
  assert.equal('videoUrl' in row, false)
  assert.equal('thumbnailUrl' in row, false)
  assert.deepEqual(row.tags, [AUTO_CATALOG_TAG])
})

test('whatever the name gives up is written with it', () => {
  const row = buildAutoCatalogExercise('Sled Push', 'sled-push')
  assert.equal(row.category, 'strongman')
  assert.deepEqual(row.equipment, ['sled'])
  assert.deepEqual(row.primaryMuscles, ['quads', 'glutes'])
  assert.equal(row.trackingType, 'time_distance')
})

test('an unreadable name still produces a complete, valid row', () => {
  const row = buildAutoCatalogExercise('Serve The Plate', 'serve-the-plate')
  assert.equal(row.category, 'strength')
  assert.deepEqual(row.primaryMuscles, [])
  assert.deepEqual(row.instructions, [])
  assert.equal(row.description, '')
  assert.ok(row.bodyRegion)
  assert.ok(row.role)
})

test('the name is stored as typed, not as the slug', () => {
  const row = buildAutoCatalogExercise('  Up-downs  ', 'up-downs')
  assert.equal(row.name, 'Up-downs')
})
