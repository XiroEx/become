// Run with: npx tsx --test tests/unit/addExerciseSheet.test.tsx
//
// The sheet's "Suggested" list is populated by an effect (a fetch to
// /api/exercises/alternatives), which does not run under sync SSR — so this
// only pins the structural wiring (the section renders when `anchorSlug` is
// given, the old empty-state text still renders when it is not, and the
// drawer's default min-height grew). The fetched-and-rendered suggestion
// rows themselves are covered by Playwright e2e.

import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import AddExerciseSheet from '@/components/workout/AddExerciseSheet'

const noop = () => {}

test('AddExerciseSheet: closed sheet renders nothing', () => {
  const html = renderToStaticMarkup(
    <AddExerciseSheet open={false} onClose={noop} onAdd={noop} />,
  )
  assert.equal(html, '')
})

test('AddExerciseSheet: without anchorSlug, empty query falls back to the plain search hint', () => {
  const html = renderToStaticMarkup(
    <AddExerciseSheet open onClose={noop} onAdd={noop} />,
  )
  assert.match(html, /Search for what you are about to do\./)
  assert.doesNotMatch(html, /data-testid="add-exercise-suggested"/)
})

test('AddExerciseSheet: with anchorSlug, the Suggested section is wired in on empty query', () => {
  const html = renderToStaticMarkup(
    <AddExerciseSheet
      open
      onClose={noop}
      onAdd={noop}
      anchorName="Flat Bench Press"
      anchorSlug="flat-bench-press"
      workoutExerciseSlugs={['flat-bench-press']}
    />,
  )
  assert.match(html, /data-testid="add-exercise-suggested"/)
})

test('AddExerciseSheet: the bottom drawer has a taller default minimum height', () => {
  const html = renderToStaticMarkup(
    <AddExerciseSheet open onClose={noop} onAdd={noop} />,
  )
  assert.match(html, /min-h-\[60vh\]/)
})
