// Run with: npm run test:file tests/unit/exerciseLibraryAddButtonPosition.test.ts
//
// The card: on the embedded "My Workout" Exercises tab, the "+ Add" button
// sat in its own row above the search bar, leaving a chunk of empty vertical
// space between the Exercises/Sessions/Programs tabs and the search input.
// Moved the Add button (and the create-exercise form it opens) to render
// after the search bar instead, so that empty header row is reclaimed.
//
// This repo has no jsdom/testing-library, so — matching the precedent in
// exerciseLibraryShowMore.test.ts — this asserts JSX render order directly
// against the source text rather than through the DOM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const src = fs.readFileSync(
  path.join(__dirname, '../../app/dashboard/workout/library/ExerciseLibraryClient.tsx'),
  'utf8',
)

test('embedded mode: the Add button renders after the search bar, not before it', () => {
  const embeddedHeaderIdx = src.indexOf('{embedded ? null : (')
  const searchIdx = src.indexOf('placeholder="Search exercises..."')
  const embeddedAddButtonIdx = src.indexOf('<div className="mb-4 flex justify-end">{addButton}</div>')

  assert.ok(embeddedHeaderIdx !== -1, 'embedded header branch not found')
  assert.ok(searchIdx !== -1, 'search input not found')
  assert.ok(embeddedAddButtonIdx !== -1, 'embedded Add button row not found')

  assert.ok(
    embeddedHeaderIdx < searchIdx,
    'the embedded header should come before the search bar',
  )
  assert.ok(
    searchIdx < embeddedAddButtonIdx,
    'the Add button must render after the search bar in embedded mode — that is the fix, ' +
      'reclaiming the empty row it used to occupy above the search bar',
  )
})

test('non-embedded mode: the standalone "My Exercises" page keeps Add next to its title (unaffected by the fix)', () => {
  const nonEmbeddedHeaderIdx = src.indexOf('My Exercises')
  const nonEmbeddedAddButtonIdx = src.indexOf('{addButton}', nonEmbeddedHeaderIdx)
  const searchIdx = src.indexOf('placeholder="Search exercises..."')

  assert.ok(nonEmbeddedHeaderIdx !== -1, 'non-embedded header not found')
  assert.ok(nonEmbeddedAddButtonIdx !== -1, 'non-embedded Add button not found')
  assert.ok(
    nonEmbeddedAddButtonIdx < searchIdx,
    'the standalone page is out of scope for this card and should keep Add in the header, before search',
  )
})

test('the create-exercise form opens next to whichever Add button triggered it', () => {
  // Non-embedded: form renders right after the header, before search.
  const nonEmbeddedFormIdx = src.indexOf('{!embedded && createForm}')
  const searchIdx = src.indexOf('placeholder="Search exercises..."')
  assert.ok(nonEmbeddedFormIdx !== -1 && nonEmbeddedFormIdx < searchIdx)

  // Embedded: form renders right after the (now relocated) Add button, still
  // after the search bar — so tapping Add doesn't pop a form up above the
  // button that opened it.
  const embeddedAddButtonIdx = src.indexOf('<div className="mb-4 flex justify-end">{addButton}</div>')
  const embeddedFormIdx = src.indexOf('{embedded && createForm}')
  assert.ok(embeddedFormIdx !== -1 && embeddedFormIdx > embeddedAddButtonIdx)
})
