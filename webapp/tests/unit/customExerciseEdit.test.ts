// Run with: npm run test:file tests/unit/customExerciseEdit.test.ts
//
// Custom exercises could be deleted from the My Exercises library but not
// edited — the only way to fix a typo'd name or a wrong tracking type was to
// delete the exercise and recreate it, losing its video in the process. This
// pins down the new edit path: a PATCH route scoped to the caller's own
// exercises (mirroring the existing DELETE), and a library UI that reveals
// Edit alongside Delete behind a per-row dropdown.
//
// Route tests need a live Mongo + auth context this suite does not stand up
// (same rationale as the other exercises/custom route tests), so this is a
// source scan: it pins down ownership scoping and field validation by reading
// the route, not by calling it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  CUSTOM_EXERCISE_MUSCLE_MAP,
  CUSTOM_EXERCISE_CATEGORY_MAP,
  resolveCustomExerciseMuscleData,
  resolveCustomExerciseCategory,
  inferCustomExerciseMuscleGroup,
  inferCustomExerciseCategory,
} from '../../lib/customExerciseFields'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── Reverse lookups round-trip, so the edit form opens with the right chips
// selected instead of nothing (or the wrong thing) lit up ────────────────────

test('every selectable muscle group round-trips through resolve → infer', () => {
  for (const group of Object.keys(CUSTOM_EXERCISE_MUSCLE_MAP)) {
    if (group === 'other') continue // not a selectable chip — collapses into full_body
    const { primaryMuscles } = resolveCustomExerciseMuscleData(group)
    assert.equal(
      inferCustomExerciseMuscleGroup(primaryMuscles),
      group,
      `resolving "${group}" then inferring it back should return "${group}"`,
    )
  }
})

test('every selectable category round-trips through resolve → infer', () => {
  for (const category of Object.keys(CUSTOM_EXERCISE_CATEGORY_MAP)) {
    const resolved = resolveCustomExerciseCategory(category)
    assert.equal(
      inferCustomExerciseCategory(resolved),
      category,
      `resolving "${category}" then inferring it back should return "${category}"`,
    )
  }
})

test('an exercise created via the old "other" muscle group infers to full_body, not chest', () => {
  // Historical data from before every surface shared this form: some
  // surfaces sent muscleGroup: 'other', which resolves to the same
  // primaryMuscles as 'full_body'. The edit form should show "Full Body"
  // selected for these, not silently default to "Chest".
  const { primaryMuscles } = resolveCustomExerciseMuscleData('other')
  assert.equal(inferCustomExerciseMuscleGroup(primaryMuscles), 'full_body')
})

test('PATCH /api/exercises/custom/[slug] exists and is gated the same way as create/delete', () => {
  const src = readSource('app/api/exercises/custom/[slug]/route.ts')
  assert.match(src, /export async function PATCH/)
  assert.match(
    src,
    /requireFeature\(req,\s*["']custom-exercises["']\)/,
    'edit must be gated behind the same custom-exercises entitlement as create/delete',
  )
})

test('PATCH only ever updates an exercise the caller owns', () => {
  const src = readSource('app/api/exercises/custom/[slug]/route.ts')
  assert.match(
    src,
    /Exercise\.findOne\(\{\s*\n?\s*slug,\s*\n?\s*isCustom:\s*true,\s*\n?\s*createdBy:\s*gate\.userId\.toString\(\),?\s*\n?\s*\}\)/,
    'the lookup must scope on slug + isCustom + createdBy, exactly like DELETE — otherwise ' +
      'a user could edit an exercise slug that belongs to someone else',
  )
})

test('PATCH validates the tracking type the same way POST does', () => {
  const src = readSource('app/api/exercises/custom/[slug]/route.ts')
  assert.match(src, /isValidCustomTrackingType\(trackingType\)/)
})

test('PATCH rebuilds tags from the edited fields, so a re-categorized exercise is not stuck with stale tags', () => {
  const src = readSource('app/api/exercises/custom/[slug]/route.ts')
  assert.match(src, /buildCustomExerciseTags\(/)
})

test('POST and PATCH share the same tracking-type / muscle-group / category resolution', () => {
  // Both routes import from the same lib rather than each carrying their own
  // copy of the MUSCLE_MAP / CATEGORY_MAP — otherwise create and edit could
  // silently drift into accepting different values for the same fields.
  const createSrc = readSource('app/api/exercises/custom/route.ts')
  const editSrc = readSource('app/api/exercises/custom/[slug]/route.ts')
  for (const src of [createSrc, editSrc]) {
    assert.match(src, /from ["']@\/lib\/customExerciseFields["']/)
  }
})

// ─── The library UI reveals Edit behind the same dropdown as Delete ──────────

test('ExerciseLibraryClient: each row can be expanded, and the expansion reveals both Edit and Delete', () => {
  const src = readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  assert.match(
    src,
    /expandedSlug/,
    'the library must track which row is expanded — a flat always-visible delete icon is not a dropdown',
  )
  assert.match(src, /startEdit\(/, 'an edit entry point must exist')
  assert.match(
    src,
    /inferCustomExerciseMuscleGroup\(ex\.primaryMuscles\)/,
    'the edit form must infer the muscle-group chip from the stored primaryMuscles, not read ' +
      'primaryMuscles[0] directly — a "back" exercise stores ["lats","upper_back"], neither of ' +
      'which is a valid muscleGroup chip value, so the wrong (or no) chip would light up',
  )
  assert.match(
    src,
    /inferCustomExerciseCategory\(ex\.category\)/,
    'the edit form must infer the category chip from the stored (resolved) category',
  )
  assert.match(
    src,
    /fetch\(`\/api\/exercises\/custom\/\$\{encodeURIComponent\(editingSlug\)\}`,\s*\{\s*\n?\s*method:\s*["']PATCH["']/,
    'saving an edit must PATCH the exercise-specific endpoint',
  )
})
