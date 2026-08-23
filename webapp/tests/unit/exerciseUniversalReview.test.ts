// Run with: npx tsx --test tests/unit/exerciseUniversalReview.test.ts
//
// "Submit to Universal": a member can ask admins to publish one of their
// custom exercises into the shared catalog so anyone can find and use it.
// Nothing becomes visible to other users until an admin approves it — see
// exerciseVisibility.test.ts for the visibility side. This file pins down
// the submission/approval pipeline itself: the model fields, the ownership-
// scoped submit/withdraw route, the admin-only approve/reject route, and the
// "an edit or a new video invalidates a prior approval" rule that keeps a
// live "verified" exercise from silently drifting from what was reviewed.
//
// Route tests need a live Mongo + auth context this suite does not stand up
// (same rationale as customExerciseEdit.test.ts), so this is a source scan.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── Model ────────────────────────────────────────────────────────────────

test('Exercise model declares the universal-submission fields with safe defaults', () => {
  const src = readSource('models/Exercise.ts')
  assert.match(src, /isUniversal:\s*\{\s*type:\s*Boolean,\s*default:\s*false/)
  assert.match(
    src,
    /reviewStatus:\s*\{\s*type:\s*String,\s*enum:\s*\[['"]none['"],\s*['"]pending['"],\s*['"]approved['"],\s*['"]rejected['"]\],\s*default:\s*['"]none['"]/,
  )
})

// ─── POST/DELETE /api/exercises/custom/[slug]/submit ─────────────────────

test('submit route exists, requires the custom-exercises entitlement, and is ownership-scoped', () => {
  const src = readSource('app/api/exercises/custom/[slug]/submit/route.ts')
  assert.match(src, /export async function POST/)
  assert.match(src, /export async function DELETE/)
  assert.match(src, /requireFeature\(request,\s*['"]custom-exercises['"]\)/)
  assert.match(
    src,
    /Exercise\.findOne\(\{\s*\n?\s*slug,\s*\n?\s*isCustom:\s*true,\s*\n?\s*createdBy:\s*gate\.userId\.toString\(\),?\s*\n?\s*\}\)/,
  )
})

test('submitting sets reviewStatus to pending and never sets isUniversal directly', () => {
  const src = readSource('app/api/exercises/custom/[slug]/submit/route.ts')
  assert.match(src, /exercise\.reviewStatus\s*=\s*['"]pending['"]/)
  assert.doesNotMatch(
    src,
    /exercise\.isUniversal\s*=\s*true/,
    'submitting must never itself grant visibility — only the admin approve route may set isUniversal true',
  )
})

test('submit route refuses to double-submit or resubmit an already-approved exercise', () => {
  const src = readSource('app/api/exercises/custom/[slug]/submit/route.ts')
  assert.match(src, /reviewStatus\s*===\s*['"]pending['"][\s\S]{0,220}409/)
  assert.match(src, /exercise\.isUniversal\)[\s\S]{0,220}409/)
})

// ─── POST /api/admin/exercises/review — the queue ─────────────────────────

test('the review queue is admin-only and lists only pending custom exercises', () => {
  const src = readSource('app/api/admin/exercises/review/route.ts')
  assert.match(src, /requireAdmin\(request\)/)
  assert.match(src, /isCustom:\s*true,\s*reviewStatus:\s*['"]pending['"]/)
})

// ─── POST /api/admin/exercises/review/[slug] — approve/reject ────────────

test('the decision route is admin-only', () => {
  const src = readSource('app/api/admin/exercises/review/[slug]/route.ts')
  assert.match(src, /requireAdmin\(request\)/)
})

test('approve is the only action that sets isUniversal true; reject clears it', () => {
  const src = readSource('app/api/admin/exercises/review/[slug]/route.ts')
  assert.match(src, /exercise\.isUniversal\s*=\s*action\s*===\s*['"]approve['"]/)
  assert.match(
    src,
    /exercise\.reviewStatus\s*=\s*action\s*===\s*['"]approve['"]\s*\?\s*['"]approved['"]\s*:\s*['"]rejected['"]/,
  )
})

test('the decision route only acts on submissions that are actually pending', () => {
  const src = readSource('app/api/admin/exercises/review/[slug]/route.ts')
  assert.match(src, /reviewStatus\s*!==\s*['"]pending['"][\s\S]{0,220}409/)
})

// ─── Approval is revoked the moment reviewed content changes ─────────────

test('editing a universal or pending custom exercise pulls it back to private', () => {
  const src = readSource('app/api/exercises/custom/[slug]/route.ts')
  assert.match(
    src,
    /if\s*\(exercise\.isUniversal\s*\|\|\s*exercise\.reviewStatus\s*===\s*['"]pending['"]\)\s*\{[\s\S]{0,200}isUniversal\s*=\s*false[\s\S]{0,200}reviewStatus\s*=\s*['"]none['"]/,
    'an edit after approval must not leave a stale "verified" exercise visible to everyone with unreviewed content',
  )
})

test('uploading a replacement video revokes a prior approval — the admin reviewed the old clip, not the new one', () => {
  const src = readSource('app/api/exercises/custom/[slug]/video/route.ts')
  const uploadFn = src.slice(src.indexOf('export async function POST'), src.indexOf('export async function DELETE'))
  assert.match(uploadFn, /isUniversal\s*=\s*false/)
  assert.match(uploadFn, /reviewStatus\s*=\s*['"]none['"]/)
})

test('deleting the video also revokes a prior approval', () => {
  const src = readSource('app/api/exercises/custom/[slug]/video/route.ts')
  const deleteFn = src.slice(src.indexOf('export async function DELETE'))
  assert.match(deleteFn, /isUniversal\s*=\s*false/)
  assert.match(deleteFn, /reviewStatus\s*=\s*['"]none['"]/)
})

// ─── Library UI wires the submit/withdraw actions and shows status ────────

test('ExerciseLibraryClient calls the submit endpoint and reflects pending/approved/rejected states', () => {
  const src = readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  assert.match(src, /\/api\/exercises\/custom\/\$\{encodeURIComponent\(slug\)\}\/submit/)
  assert.match(src, /ex\.isUniversal/)
  assert.match(src, /ex\.reviewStatus\s*===\s*["']pending["']/)
  assert.match(src, /ex\.reviewStatus\s*===\s*["']rejected["']/)
})

test('the admin exercises page links to the review queue', () => {
  const src = readSource('app/dashboard/admin/exercises/page.tsx')
  assert.match(src, /\/dashboard\/admin\/exercises\/review/)
})
